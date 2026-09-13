# Style guide

_Last verified: 2026-09-14, against the actual repo contents._

## Part 1 — Code conventions

- **No lint/format config in the repo.** No `.eslintrc*`/`eslint.config.*`, no `.prettierrc*`, no `lint` script in `package.json` (only `dev`/`build`/`start`). Quote style is inconsistent as a result (single quotes in most `lib/` files, double quotes in `app/` and the API templates) — nothing currently enforces one or the other.
- **Exports**: utilities are arrow-function `const`s (`export const doThing = (...) => {}`), not `function` declarations, across every file in `lib/utils/` and `lib/api/`.
- **Naming**: camelCase for functions/variables, PascalCase for types (`ImageMetadata`, `WhereClause`, `ApiSuccess<T>`), kebab-case for filenames (`firebase-mongo-api.ts`, `use-mobile.ts`). **Exception: any field written to a Firestore/Mongo document must be snake_case** (`created_at`, `updated_at`, `first_name`, ...), never camelCase — see `docs/DATABASE.md`. This applies to the document's on-the-wire field names only; the TypeScript variables/params referencing that data stay camelCase as normal.
- **Error handling is layer-dependent — check which layer you're in before assuming a pattern:**
  - `lib/api/firebase-mongo-api.ts` (CRUD/array helpers): catch internally, return `{ error: string }`. Exception: `findOneAndUpdateFirestoreMongo` throws and returns `null` for "not found".
  - `lib/api/firebase-mongo-api.ts` (aggregation helpers — `count`/`sum`/`avg`/`max`/`min`): catch internally, return a bare error **string** (not wrapped in `{ error }`) on failure.
  - `lib/api/r2-api.ts` (storage): throws on failure. Never returns `{ error }`.
  - Route handlers: outer `try/catch` (for thrown exceptions, e.g. from R2 or unexpected failures) **plus** an `isErrorResult()` type guard after every Mongo-helper call (for the `{ error }`-returning helpers) — both are needed, see the templates in `app/api/_template/` for the exact pattern.
- **API routes**: always return the `{ success: true, data }` / `{ success: false, error }` envelope via local `ok()`/`fail()` — see `docs/ARCHITECTURE.md`. Don't invent a different response shape.
- **IDs**: app-generated 20-char strings via `generateFirestoreId()`, never rely on Mongo `ObjectId` formatting/behavior.
- **Path alias**: `@/*` resolves to the repo root — always import via `@/lib/...`, `@/components/...`, never relative-path out of a module's own folder.
- **Runtime-environment split**: `lib/utils/client/*` vs `lib/utils/server/*` is a hard boundary, not just organization — the server files use Node built-ins (`fs`, `os`) and native deps (`sharp`, `fluent-ffmpeg`) that don't run in the browser, and the client files use browser globals (`document`, `canvas`, `window`) that don't exist in a Route Handler.

## Part 2 — Visual/UI conventions

- **Component library**: shadcn, `style: base-nova`, installed via the `shadcn` CLI (`components.json`). Everything under `components/ui/` is a shadcn primitive — there are no custom composed components yet. Icons via `lucide-react` (`iconLibrary: "lucide"` in `components.json`).
- **Colors — theme tokens for neutrals, hardcoded hue allowed with a `dark:` pair.** `app/globals.css` defines the full palette as CSS custom properties in `:root` (light) and `.dark` (dark), using `oklch()` values, then re-exposes them as Tailwind utilities via `@theme inline` (`--color-background`, `--color-primary`, `--color-sidebar`, `--color-chart-1`...`5`, etc.). Any white/grey/black shade **must** go through those tokens (`bg-background`, `text-foreground`, `border-border`, ...) — never hardcoded. A Tailwind color class with actual hue (`bg-amber-500`, `text-sky-600`, ...) may be hardcoded when the token system doesn't cover that specific brand/accent/semantic color, but it must always be paired with its `dark:` variant (`bg-amber-500 dark:bg-amber-400`) so the UI stays correct the moment a dark-mode toggle exists. Never a raw hex/rgb literal (`style={{ color: '#...' }}`) either way — stick to Tailwind palette classes so the `dark:` pairing stays declarative. `app/page.tsx` follows this convention (theme tokens only, no hardcoded colors).
- **Dark mode**: the `.dark` variant and a complete dark palette already exist in `globals.css` (`@custom-variant dark (&:is(.dark *))`), but nothing in the codebase currently toggles the `.dark` class — there's no theme switcher/provider. Dark mode is fully wired at the token level and inert at the application level; adding a toggle later should be structural (add the toggle + persist the class), not a token rewrite.
- **Spacing/radius**: standard Tailwind spacing scale; corner radius is token-driven off a single `--radius` base (`--radius-sm` through `--radius-4xl` are all `calc()`s of it in `@theme inline`) — don't hardcode `rounded-[Npx]` where a `--radius-*` token fits.
- **Layout primitives**: `TooltipProvider` wraps the whole app in `app/layout.tsx`; `components/ui/sidebar.tsx` is present (full shadcn sidebar system) but not yet mounted anywhere.
- **Typography**: Google Sans is the only font (`--font-sans`, `lib/config/fonts.ts`) — there's no separate mono font; `font-mono` utility classes fall back to Tailwind's default monospace stack. Portal-rendered components (dialog/sheet/drawer/alert-dialog/toast/tooltip) apply the font directly rather than relying on inheritance — see `docs/ARCHITECTURE.md`.
