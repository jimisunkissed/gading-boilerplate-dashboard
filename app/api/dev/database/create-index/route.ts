import { after, NextRequest } from "next/server";
import { getDatabase } from "@/lib/config/firebase-mongo-config";
import { PENDING_INDEXES } from "@/lib/config/database-indexes";
import { createIndexesStaggered, INDEX_STAGGER_MS, planIndexes } from "@/lib/api/database-index-api";
import { devOnlyGuard, fail, ok } from "@/lib/utils/server/dev-route-util";

declare global {
  var __createIndexRunning: boolean | undefined;
}

/**
 * Dev-only: requests every index in PENDING_INDEXES (lib/config/database-indexes.ts).
 * Backend limits and the commit-time workflow: "Indexes" in docs/DATABASE.md.
 *
 *   POST /api/dev/database/create-index
 *   body (all optional):
 *     dryRun:      true     -> only list what would be created, touch nothing
 *     collections: string[] -> limit to these collections (default: all in PENDING_INDEXES)
 *
 * Responds immediately; the indexes are then requested one every INDEX_STAGGER_MS via after(),
 * so progress is only visible in the server console (confirm with GET /api/dev/database/check-index).
 * createIndex is idempotent: an index that already exists with the same key is a no-op.
 */
export async function POST(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;

    const queue = planIndexes(PENDING_INDEXES, Array.isArray(body?.collections) ? body.collections : undefined);
    if ("error" in queue) return fail(queue.error);

    const plan = queue.map(({ collection, label, entry }) => ({ collection, key: label, used_by: entry.usedBy }));
    if (dryRun) return ok({ dry_run: true, total: queue.length, plan });
    if (!queue.length) return ok({ started: false, total: 0, plan });

    if (globalThis.__createIndexRunning) return fail("A create-index run is still in progress, wait for it to finish", 409);

    await getDatabase(); // fail here, not silently inside after(), if the database is unreachable
    globalThis.__createIndexRunning = true;
    // after() keeps the work alive past the response, up to the platform's max duration
    // (raise it with `export const maxDuration` on hosts that support it for long queues).
    after(() =>
      createIndexesStaggered(queue)
        .catch((error) => console.error("[create-index] aborted:", error))
        .finally(() => {
          globalThis.__createIndexRunning = false;
        }),
    );

    return ok({
      started: true,
      total: queue.length,
      stagger_seconds: INDEX_STAGGER_MS / 1000,
      estimated_minutes: Math.ceil(((queue.length - 1) * INDEX_STAGGER_MS) / 60_000),
      plan,
    });
  } catch (err) {
    console.error("POST /api/dev/database/create-index failed:", err);
    return fail("Something went wrong requesting indexes", 500);
  }
}
