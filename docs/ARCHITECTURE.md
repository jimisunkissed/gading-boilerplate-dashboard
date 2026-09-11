# Architecture

_Last verified: 2026-09-12, against the actual repo contents._

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

- `app/layout.tsx` — root layout, wraps `children` in `TooltipProvider` (from `components/ui/tooltip`), loads Geist fonts.
- `app/page.tsx` — the **unmodified `create-next-app` starter page**. Nothing product-specific has been built yet.
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
  layout.tsx, page.tsx, globals.css
components/ui/       shadcn primitives only — no custom composed components yet
hooks/                use-mobile.ts (useIsMobile)
lib/
  api/                external-service wrapper functions (Mongo, R2) — see docs/FUNCTIONS.md
  config/             singleton client construction (Mongo client promise, S3Client)
  stores/             zustand stores
  utils/client/        browser-only helpers
  utils/server/        Node-only helpers
  utils.ts             re-exports `cn` (from the `cn` npm package)
public/               default create-next-app SVGs, unused otherwise
```

Path alias: `@/*` → repo root (`tsconfig.json`).

## Known gap

`.env.example` declares `FIREBASE_MONGODB_URI`, but `lib/config/firebase-mongo-config.ts` reads `process.env.FIRESTORE_MONGODB_URI` — the names don't match, so following `.env.example` literally will leave the app unable to connect. Fix one side before wiring up a real database.

Clerk env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SIGNING_SECRET`) are present in `.env.example` and referenced in a comment in `upload-route.example.ts`, but `@clerk/nextjs` is **not** a dependency in `package.json` and there is no `middleware.ts` — auth is not actually wired up yet, only anticipated.
