import { checkIndexes } from "@/lib/api/database-index-api";

// lib/config/firebase-mongo-config.ts connects eagerly on import and nothing awaits that first promise; if the database is
// unreachable the same failure also surfaces through the helpers below, so don't let the stray rejection kill the process.
process.on("unhandledRejection", () => {});

// Standalone version of GET /api/dev/database/check-index, so it works without the dev server
// (e.g. from the SessionStart hook in .claude/settings.json). Run with `npm run db:check-index`; pass --explain for explain output.
// Exit codes: 0 = registry and database agree, 2 = differences found (the hook's asyncRewake uses this to wake Claude),
// 1 = the check itself failed (e.g. no FIRESTORE_MONGODB_URI, database unreachable) — never woken for that.
async function main() {
  const explain = process.argv.includes("--explain");
  const { collections } = await checkIndexes({ explain });

  const problems = Object.entries(collections).filter(
    ([, r]) => r.error || r.missing.length || r.pending_missing.length || r.to_remove_still_present.length || r.unregistered.length,
  );

  if (!problems.length) console.log(`[check-index] ${Object.keys(collections).length} collection(s) checked, registry and database agree`);
  else {
    console.error("[check-index] differences found:\n" + JSON.stringify(Object.fromEntries(problems), null, 2));
    process.exitCode = problems.some(([, r]) => r.error) ? 1 : 2;
  }

  if (explain) console.log(JSON.stringify(collections, null, 2));
}

main()
  .catch((error) => {
    console.error("[check-index] failed:", (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => process.exit()); // the pooled client keeps the event loop alive
