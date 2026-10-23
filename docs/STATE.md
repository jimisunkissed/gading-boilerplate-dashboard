# Project state

_Last updated: 2026-10-23_

## What's built

- Next.js 16 / React 19 / Tailwind v4 project scaffold, shadcn installed (`base-nova` style, ~55 primitives under `components/ui/`, no custom components composed from them yet).
- Full light/dark CSS-variable theme split across `app/styles/` (tokens, theme, base, utilities, animations), with `app/globals.css` acting only as the import router (dark mode tokens exist, no toggle wired — see `docs/STYLEGUIDE.md`).
- Google Sans as the sole font, bound to `--font-sans` (`lib/config/fonts.ts`, applied in `app/layout.tsx`) — fixes a prior bug where the layout set `--font-geist-sans` while `globals.css` read `--font-sans`, so no custom font was actually applying anywhere. Portal-rendered shadcn components (dialog/sheet/drawer/alert-dialog/toast/tooltip) apply it directly to their content root too — see `docs/ARCHITECTURE.md`. Geist Mono has been removed; `font-mono` utility classes now fall back to Tailwind's default monospace stack.
- A minimal landing page at `app/page.tsx` — a "hello, welcome" intro to the boilerplate with a footer credit, replacing the default `create-next-app` starter content.
- Database access layer: MongoDB (Firestore-compatible) client singleton + a full CRUD/aggregation/array-ops helper set in `lib/api/firebase-mongo-api.ts` (20 functions — see `docs/FUNCTIONS.md`).
- Storage access layer: Cloudflare R2 upload/delete helpers in `lib/api/r2-api.ts`.
- Media processing utilities for images and video, split into client (browser/wasm) and server (native) implementations — see `docs/FUNCTIONS.md`.
- One zustand store (`useAuthStore`) modeling a signed-in user shape, not yet connected to any actual auth provider.
- Database index management: dev-only `POST /api/dev/database/create-index`, `POST /api/dev/database/remove-index` and `GET /api/dev/database/check-index`, backed by the registry in `lib/config/database-indexes.ts` (one placeholder `items` entry pending), plus `npm run db:check-index` and a `SessionStart` hook (`.claude/settings.json`) that runs it in the background. The commit-time workflow is rule 7 in `CLAUDE.md`. See `docs/DATABASE.md`.
- Two **reference-only** API route templates (`app/api/_template/*.example.ts`) demonstrating the CRUD pattern and the multipart upload pattern — intentionally inert (see `docs/ARCHITECTURE.md`).

## What's stubbed / unfinished

- **No real feature routes or pages exist.** `app/page.tsx` is a minimal intro/landing page, not a dashboard — there is no dashboard UI yet.
- **No live feature API routes.** Everything under `app/api/` except the dev-only `dev/database/*` index endpoints is a `.example.ts` template, not a `route.ts`.
- **No real database collections.** The only collection names anywhere (`items`, `media`) are placeholders inside the example templates.
- **Auth is not wired up.** Clerk env vars exist in `.env.example` and are mentioned in a code comment, but `@clerk/nextjs` is not installed and there's no `middleware.ts`.
- **No theme toggle** despite dark-mode tokens being fully defined.
- **No tests, no lint/format config, no CI.**

## Known issues

1. **`useAuthStore.setUser` type mismatch**: it computes a `name` field that isn't declared on `AuthStoreProps['user']` (the type only has `full_name`). See `docs/FUNCTIONS.md`.
2. Response-envelope helpers (`ok`/`fail`/`isErrorResult`) are duplicated between the two example templates rather than shared — fine at 2 files, worth centralizing once real routes multiply.
3. **Index tooling is unverified against a live database.** The endpoints, `scripts/check-index.ts` and its exit-2 (drift) path were only exercised with the database unreachable and in `dryRun`; real `createIndex`/`listIndexes`/`dropIndex`/`explain` calls haven't been run. The `explain` output shape is the backend's own. Also: no usage statistics or build status exist through the Mongo API, so unused-index detection is manual (see `docs/DATABASE.md`).
4. **`app/styles/animations/` split is inverted**: `keyframes.css` holds the keyframes *and* the `.animate-*` classes (plus `.parallax` and `@property --p`), while `classes.css` only repeats a subset of the same `@keyframes` (no `*-top` variants). Both are imported, so it compiles, but `classes.css` is redundant until the classes are moved into it.
5. `theme.css` defines `--color-brand-150`, which maps to `--color-red-150` — that shade doesn't exist in Tailwind's palette, so `bg-brand-150` resolves to nothing. Also `base.css` still has hardcoded `bg-white dark:bg-black` / `bg-orange-100` (see `docs/STYLEGUIDE.md`).

## Open questions for whoever picks this up next

- Is Clerk actually the intended auth provider, or were those env vars placeholder/aspirational? No package is installed either way.
- Confirm which Mongo-compatible backend `FIRESTORE_MONGODB_URI` is meant to point at (inferred from code comments to be a Firestore Mongo-compatibility endpoint) — this affects whether `$lookup` support could ever be added or is a hard platform constraint.
