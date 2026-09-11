@AGENTS.md

# gading-boilerplate-dashboard

Next.js 16 (App Router) + MongoDB (Firestore-compatible) + Cloudflare R2 dashboard boilerplate. Currently at the scaffold stage — see `docs/STATE.md` for what's actually built vs. stubbed before assuming a feature exists.

## Docs

- `docs/ARCHITECTURE.md` — routing convention, client/server split, API response envelope, folder structure
- `docs/DATABASE.md` — Mongo connection, collections, document shape, filter operators
- `docs/FUNCTIONS.md` — every utility module and its exported functions, signatures, and when to use them
- `docs/STYLEGUIDE.md` — code conventions (naming, error-handling per layer) and visual/UI conventions (theme tokens, dark mode)
- `docs/STATE.md` — what's built, stubbed, known issues, last-updated date

Read the relevant doc before touching that area of the code — they're kept current as part of every session (see rule 6 below).

## Standing rules

1. **Database access**: default to the helpers in `lib/api/firebase-mongo-api.ts` (16 functions covering CRUD, filtering, pagination, aggregation, array ops — see `docs/FUNCTIONS.md` / `docs/DATABASE.md`). If a specific route genuinely needs something the helpers don't support (e.g. an OR filter, which `buildMongoFilter` can't express), it's fine to write a custom query directly in that one route file — that's a deliberate escape hatch, not a violation. If you find yourself reaching for the escape hatch more than once for the same need, add a helper instead.
2. **Field naming**: every field written to a Firestore/Mongo document must be **snake_case** (`created_at`, `updated_at`, `first_name`, ...) — never camelCase. This applies to `docData` passed into the database helpers, and to any `field`/`select` value used in a `WhereClause` or `SortBy`. The helpers don't normalize casing, so a camelCase field will silently miss/filter/sort against nothing. TypeScript identifiers (variables, function names) are unaffected and stay camelCase.
3. **Media uploads**: always go through `lib/api/r2-api.ts` (`uploadFileR2`, `deleteFileR2`, `extractKeyR2`) for anything touching object storage. Never call the S3 SDK directly in a route.
4. **Other utilities**: before writing inline date/string/number/image/video/file logic, check `docs/FUNCTIONS.md` — there's likely already a helper in `lib/utils/client/` or `lib/utils/server/` (mind the client/server split — see `docs/ARCHITECTURE.md`).
5. **Styling**: never hardcode a hex/rgb color in component code — always use the CSS variable/theme tokens defined in `app/globals.css` (`bg-background`, `text-foreground`, etc.). This is what keeps a future dark-mode toggle cheap; dark mode itself stays optional for now. (`app/page.tsx` currently violates this — it's leftover scaffolding, not a pattern to follow.)
6. **Big changes**: before a change that touches many files, or deletes/renames/restructures something load-bearing, suggest committing current work first so it's easy to revert. A suggestion, not a gate.
7. **End-of-session ritual**, every session: (1) run `npm run build` and resolve anything it flags, (2) update whichever `docs/*.md` files no longer reflect the current code, (3) commit with a clear message.
