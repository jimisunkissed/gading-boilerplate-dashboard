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

## First clone check

Run `git remote get-url origin` at the start of a session. If it's still `https://github.com/jimisunkissed/gading-boilerplate-dashboard.git`, this is a fresh, unmodified clone of the template (not yet repointed to the user's own project) — before doing anything else, suggest they create a new GitHub repository and repoint `origin` to it, so their work doesn't end up pushed back into the boilerplate. A suggestion, not a gate — proceed with the actual task either way if they decline or want to do it later. Skip this check silently once `origin` points elsewhere.

## Standing rules

1. **Database access**: default to the helpers in `lib/api/firebase-mongo-api.ts` (20 functions covering CRUD, filtering, pagination, aggregation, array ops — see `docs/FUNCTIONS.md` / `docs/DATABASE.md`). If a specific route genuinely needs something the helpers don't support (e.g. an OR filter, which `buildMongoFilter` can't express), it's fine to write a custom query directly in that one route file — that's a deliberate escape hatch, not a violation. If you find yourself reaching for the escape hatch more than once for the same need, add a helper instead.
2. **Field naming**: every field written to a Firestore/Mongo document must be **snake_case** (`created_at`, `updated_at`, `first_name`, ...) — never camelCase. This applies to `docData` passed into the database helpers, and to any `field`/`select` value used in a `WhereClause` or `SortBy`. The helpers don't normalize casing, so a camelCase field will silently miss/filter/sort against nothing. TypeScript identifiers (variables, function names) are unaffected and stay camelCase.
3. **Media uploads**: always go through `lib/api/r2-api.ts` (`uploadFileR2`, `deleteFileR2`, `extractKeyR2`) for anything touching object storage. Never call the S3 SDK directly in a route.
4. **Other utilities**: before writing inline date/string/number/image/video/file logic, check `docs/FUNCTIONS.md` — there's likely already a helper in `lib/utils/client/` or `lib/utils/server/` (mind the client/server split — see `docs/ARCHITECTURE.md`).
5. **Styling**: neutral colors (white/grey/black shades) always use the theme tokens in `app/globals.css` (`bg-background`, `text-foreground`, `border-border`, etc.) — never hardcode those. A hardcoded Tailwind color class is allowed only when the color actually has hue (a brand/accent/semantic color the token system doesn't cover, e.g. `bg-amber-500`, `text-sky-600`) — and only paired with its `dark:` counterpart (e.g. `bg-amber-500 dark:bg-amber-400`) so the UI still looks right the moment a dark-mode toggle exists. Never use a raw hex/rgb literal (`style={{ color: '#...' }}`) — Tailwind palette classes only, so the `dark:` variant stays declarative. (`app/page.tsx` currently violates this — it's leftover scaffolding, not a pattern to follow.)
6. **Big changes**: before a change that touches many files, or deletes/renames/restructures something load-bearing, suggest committing current work first so it's easy to revert. A suggestion, not a gate.
7. **Docs stay in sync with code, enforced at commit time**: before any commit that adds/removes/changes a route (`app/**/route.ts`, `app/**/page.tsx`), a page's content/behavior, a `lib/` helper, or a collection shape:
   - Add or update the route/page in `docs/ARCHITECTURE.md`'s Routing section (path, purpose, what it renders/returns).
   - Update `docs/STATE.md`'s built/stubbed/known-issues lists to match.
   - Update `docs/FUNCTIONS.md` / `docs/DATABASE.md` if a helper or collection changed.
   - Bump the `_Last updated` date on any file you touch.
   - **Database indexes** (only if the changes touch database requests — calls to `lib/api/firebase-mongo-api.ts` helpers with `where`/`sortBy`, custom driver queries, or queries that were removed/changed). Review `git diff HEAD` for them, derive the indexes they need (equality → sort → range; see `docs/DATABASE.md` "Indexes") and compare with `lib/config/database-indexes.ts`. If the registry is out of date, **stop before committing and tell the user** (interrupting is expected): list the entries to add to `PENDING_INDEXES` and the ones to move to `REMOVE_INDEXES`, and wait for approval. Once approved: update the registry, then — with the dev server running — `POST /api/dev/database/create-index` and `/remove-index` (`{ "dryRun": true }` first), then move the sent `PENDING_INDEXES` entries into `CREATED_INDEXES` under a dated comment (and clear processed `REMOVE_INDEXES` entries the same way). Don't wait for builds to finish (`create-index` returns at once; builds continue in the cloud); `GET /api/dev/database/check-index` reports whether they show up. Never call these endpoints, or drop an index, without the user's go-ahead, and never drop an index just because it looks unused — the backend exposes no usage statistics.

   Do this in the same commit as the code change, not a follow-up — a commit that changes routing/pages/helpers without a corresponding doc update is incomplete. Also run `npm run build` and resolve anything it flags before committing.

   A `SessionStart` hook (`.claude/settings.json`) runs `npm run db:check-index` in the background and wakes you only when the registry and the database disagree. When that happens, tell the user what differs and ask how to proceed; don't fix it silently.
