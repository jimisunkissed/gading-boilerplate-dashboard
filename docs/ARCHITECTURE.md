# Architecture

_Last verified: 2026-10-23, against the actual repo contents._

## Stack

- **Next.js 16.3.4**, App Router (`app/`), React Compiler enabled (`next.config.ts`)
- **React 19.2.8**, TypeScript, strict mode
- **Tailwind CSS v4** + **shadcn** (`style: base-nova`, `baseColor: neutral`, CSS variables on) — see `components.json`
- **zustand** for client state
- **MongoDB driver** via a Firestore-compatible connection (see `docs/DATABASE.md`)
- **Cloudflare R2** for object storage, via `@aws-sdk/client-s3`
- **sharp** / **fluent-ffmpeg** (server) and **@ffmpeg/ffmpeg** wasm / **browser-image-compression** (client) for media processing

## Routing

App Router only — no `pages/` directory. Currently the tree is minimal:

- `app/layout.tsx` — root layout, wraps `children` in `TooltipProvider` (from `components/ui/tooltip`). Applies the font from `lib/config/fonts.ts` (`googleSans` → `--font-sans`) as an `<html>` class.
- `app/page.tsx` — a minimal "hello, welcome" intro/landing page for the boilerplate (badge + heading + description + footer credit). Not a dashboard — replace it once real product UI exists.
- `app/api/dev/database/` — three **live, dev-only** index endpoints (all return 404 when `NODE_ENV === 'production'`; registry in `lib/config/database-indexes.ts`, logic in `lib/api/database-index-api.ts`). See "Indexes" in `docs/DATABASE.md`:
  - `create-index/route.ts` — `POST` (body: optional `dryRun`, `collections`). Requests the `PENDING_INDEXES`, one every 30s via `after()`; returns immediately, progress in the server console.
  - `remove-index/route.ts` — `POST` (same body). Drops the `REMOVE_INDEXES`, outcomes in the response.
  - `check-index/route.ts` — `GET` (`?explain=true` optional). Compares the registry with `listIndexes` per collection.
- `scripts/check-index.ts` — standalone version of `check-index` (`npm run db:check-index`), run in the background by the `SessionStart` hook in `.claude/settings.json`.
- `app/api/_template/` — two **reference templates**, not live routes:
  - `crud-route.example.ts`
  - `upload-route.example.ts`

  These use the `.example.ts` extension specifically so Next does **not** register them as route handlers. To create a real endpoint, copy the relevant template into `app/api/<name>/route.ts` and adjust the `COLLECTION` constant and body shape.

Next.js 16 uses the global `LayoutProps<'/route'>` / `PageProps<'/route'>` helper types (no import needed) — `app/layout.tsx` already uses this convention. See `node_modules/next/dist/docs/01-app/` for anything routing-related that looks unfamiliar; this version has breaking changes vs. older Next.js.

## Client vs. server split

No feature code exists yet that draws this line in `app/`, but the convention is set up structurally:

- `lib/utils/client/*` — browser-only code (canvas, `browser-image-compression`, `@ffmpeg/ffmpeg` wasm). Only usable from Client Components.
- `lib/utils/server/*` — Node-only code (`sharp`, `fluent-ffmpeg`, `fs`, `os`). Only usable from Route Handlers / Server Components.
- Every shadcn primitive under `components/ui/` that needs interactivity already declares `"use client"` at the top (most of them — anything Radix/base-ui-driven). `app/page.tsx` and `app/layout.tsx` currently have no `"use client"` and are plain Server Components.
- **Font module (`lib/config/fonts.ts`)**: `googleSans` lives in its own module rather than being defined inline in `app/layout.tsx`, specifically so portal-rendered `"use client"` components (`dialog`, `sheet`, `drawer`, `alert-dialog`, `toast`, `tooltip` — anything whose content mounts outside the normal DOM subtree via a Portal) can import `googleSans` and apply `googleSans.className` to their content root directly, rather than relying on CSS-variable inheritance from `<html>`. Defining the font in `app/layout.tsx` and importing it back into `components/ui/tooltip.tsx` doesn't work — `app/layout.tsx` renders `TooltipProvider` from that same file, so the cycle pulls the (non-`"use client"`) layout module into the client bundle and breaks its `metadata` export. If a new font is ever added for portal components, put it in `lib/config/fonts.ts`, not in `app/layout.tsx`. (Geist Mono was removed — Google Sans is the only font in this module now; `font-mono` utility classes fall back to Tailwind's default monospace stack since `--font-mono` is no longer overridden in `globals.css`.)

## API response envelope

Both templates in `app/api/_template/` define and use the same shape:

```ts
type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; error: string };
```

built via local `ok(data, status?)` / `fail(error, status?)` helpers. This is the standard for any new route — see `docs/STYLEGUIDE.md`. Note the helpers are currently copy-pasted into each template rather than shared from one file; if/when more than a couple of real routes exist, pulling `ok`/`fail`/`isErrorResult` into a shared module (e.g. `lib/api/response.ts`) would be a reasonable de-dupe.

## Folder structure

```
app/
  api/_template/     example route handlers (inert, copy-and-rename to use)
  api/dev/database/  dev-only index endpoints (create-index, remove-index, check-index)
  layout.tsx, page.tsx, globals.css
components/ui/       shadcn primitives only — no custom composed components yet
hooks/                use-mobile.ts (useIsMobile)
lib/
  api/                external-service wrapper functions (Mongo, R2) — see docs/FUNCTIONS.md
  config/             singleton client construction (Mongo client promise, S3Client), fonts.ts (googleSans)
  stores/             zustand stores
  utils/client/        browser-only helpers
  utils/server/        Node-only helpers
  utils.ts             re-exports `cn` (from the `cn` npm package)
public/               default create-next-app SVGs, unused otherwise
```

Path alias: `@/*` → repo root (`tsconfig.json`).

## Known gap

Clerk env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SIGNING_SECRET`) are present in `.env.example` and referenced in a comment in `upload-route.example.ts`, but `@clerk/nextjs` is **not** a dependency in `package.json` and there is no `middleware.ts` — auth is not actually wired up yet, only anticipated.
