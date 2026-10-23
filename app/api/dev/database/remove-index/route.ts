import { NextRequest } from "next/server";
import { REMOVE_INDEXES } from "@/lib/config/database-indexes";
import { dropIndexes, planIndexes } from "@/lib/api/database-index-api";
import { devOnlyGuard, fail, ok } from "@/lib/utils/server/dev-route-util";

/**
 * Dev-only: drops every index in REMOVE_INDEXES (lib/config/database-indexes.ts) — the ones no
 * query uses any more. Nothing is ever dropped automatically: an index only lands in
 * REMOVE_INDEXES after the user approved it (see rule 7 in CLAUDE.md).
 *
 *   POST /api/dev/database/remove-index
 *   body (all optional):
 *     dryRun:      true     -> only list what would be dropped, touch nothing
 *     collections: string[] -> limit to these collections (default: all in REMOVE_INDEXES)
 *
 * Drops are quick, so they run one after another and the outcomes come back in the response.
 * An index that is already gone counts as dropped.
 */
export async function POST(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;

    const queue = planIndexes(REMOVE_INDEXES, Array.isArray(body?.collections) ? body.collections : undefined);
    if ("error" in queue) return fail(queue.error);

    const plan = queue.map(({ collection, label, entry }) => ({ collection, key: label, used_by: entry.usedBy }));
    if (dryRun) return ok({ dry_run: true, total: queue.length, plan });

    const outcomes = await dropIndexes(queue);
    return ok({ total: queue.length, outcomes });
  } catch (err) {
    console.error("POST /api/dev/database/remove-index failed:", err);
    return fail("Something went wrong dropping indexes", 500);
  }
}
