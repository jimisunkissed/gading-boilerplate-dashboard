# Project state

_Last updated: 2026-09-14_

## What's built

- Next.js 16 / React 19 / Tailwind v4 project scaffold, shadcn installed (`base-nova` style, ~55 primitives under `components/ui/`, no custom components composed from them yet).
- Full light/dark CSS-variable theme in `app/globals.css` (dark mode tokens exist, no toggle wired — see `docs/STYLEGUIDE.md`).
- Google Sans as the sole font, bound to `--font-sans` (`lib/config/fonts.ts`, applied in `app/layout.tsx`) — fixes a prior bug where the layout set `--font-geist-sans` while `globals.css` read `--font-sans`, so no custom font was actually applying anywhere. Portal-rendered shadcn components (dialog/sheet/drawer/alert-dialog/toast/tooltip) apply it directly to their content root too — see `docs/ARCHITECTURE.md`. Geist Mono has been removed; `font-mono` utility classes now fall back to Tailwind's default monospace stack.
- A minimal landing page at `app/page.tsx` — a "hello, welcome" intro to the boilerplate with a footer credit, replacing the default `create-next-app` starter content.
- Database access layer: MongoDB (Firestore-compatible) client singleton + a full CRUD/aggregation/array-ops helper set in `lib/api/firebase-mongo-api.ts` (16 functions — see `docs/FUNCTIONS.md`).
- Storage access layer: Cloudflare R2 upload/delete helpers in `lib/api/r2-api.ts`.
- Media processing utilities for images and video, split into client (browser/wasm) and server (native) implementations — see `docs/FUNCTIONS.md`.
- One zustand store (`useAuthStore`) modeling a signed-in user shape, not yet connected to any actual auth provider.
- Two **reference-only** API route templates (`app/api/_template/*.example.ts`) demonstrating the CRUD pattern and the multipart upload pattern — intentionally inert (see `docs/ARCHITECTURE.md`).

## What's stubbed / unfinished

- **No real feature routes or pages exist.** `app/page.tsx` is a minimal intro/landing page, not a dashboard — there is no dashboard UI yet.
- **No live API routes.** Everything under `app/api/` is a `.example.ts` template, not a `route.ts`.
- **No real database collections.** The only collection names anywhere (`items`, `media`) are placeholders inside the example templates.
- **Auth is not wired up.** Clerk env vars exist in `.env.example` and are mentioned in a code comment, but `@clerk/nextjs` is not installed and there's no `middleware.ts`.
- **No theme toggle** despite dark-mode tokens being fully defined.
- **No tests, no lint/format config, no CI.**

## Known issues

1. **`useAuthStore.setUser` type mismatch**: it computes a `name` field that isn't declared on `AuthStoreProps['user']` (the type only has `full_name`). See `docs/FUNCTIONS.md`.
2. Response-envelope helpers (`ok`/`fail`/`isErrorResult`) are duplicated between the two example templates rather than shared — fine at 2 files, worth centralizing once real routes multiply.

## Open questions for whoever picks this up next

- Is Clerk actually the intended auth provider, or were those env vars placeholder/aspirational? No package is installed either way.
- Confirm which Mongo-compatible backend `FIRESTORE_MONGODB_URI` is meant to point at (inferred from code comments to be a Firestore Mongo-compatibility endpoint) — this affects whether `$lookup` support could ever be added or is a hard platform constraint.
