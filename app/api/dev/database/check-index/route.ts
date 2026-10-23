import { NextRequest } from "next/server";
import { checkIndexes } from "@/lib/api/database-index-api";
import { devOnlyGuard, fail, ok } from "@/lib/utils/server/dev-route-util";

/**
 * Dev-only, read-only: compares the registries in lib/config/database-indexes.ts with what the
 * database reports via listIndexes, per collection (ready / pending_missing / missing /
 * to_remove_still_present / unregistered — see IndexCheckReport).
 *
 *   GET /api/dev/database/check-index
 *   GET /api/dev/database/check-index?explain=true
 *     also runs `explain` (executionStats) on each entry's `sample` query. The output shape is the
 *     backend's own and is returned untouched — read it to spot full scans.
 *
 * "ready" = present in listIndexes. The Mongo API can't prove a build has finished, and it exposes
 * no index usage statistics ($indexStats is unsupported), so nothing here proves an index is unused.
 */
export async function GET(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  try {
    const explain = new URL(request.url).searchParams.get("explain") === "true";
    return ok(await checkIndexes({ explain }));
  } catch (err) {
    console.error("GET /api/dev/database/check-index failed:", err);
    return fail("Something went wrong checking indexes", 500);
  }
}
