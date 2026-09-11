# Style guide

_Last verified: 2026-09-12, against the actual repo contents._

## Part 1 — Code conventions

- **No lint/format config in the repo.** No `.eslintrc*`/`eslint.config.*`, no `.prettierrc*`, no `lint` script in `package.json` (only `dev`/`build`/`start`). Quote style is inconsistent as a result (single quotes in most `lib/` files, double quotes in `app/` and the API templates) — nothing currently enforces one or the other.
- **Exports**: utilities are arrow-function `const`s (`export const doThing = (...) => {}`), not `function` declarations, across every file in `lib/utils/` and `lib/api/`.
- **Naming**: camelCase for functions/variables, PascalCase for types (`ImageMetadata`, `WhereClause`, `ApiSuccess<T>`), kebab-case for filenames (`firebase-mongo-api.ts`, `use-mobile.ts`).
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
- **Colors — theme tokens only.** `app/globals.css` defines the full palette as CSS custom properties in `:root` (light) and `.dark` (dark), using `oklch()` values, then re-exposes them as Tailwind utilities via `@theme inline` (`--color-background`, `--color-primary`, `--color-sidebar`, `--color-chart-1`...`5`, etc.). Every `components/ui/*` file consumes these through the generated Tailwind classes (`bg-background`, `text-foreground`, `border-border`, ...) — never a hex/rgb literal. **Follow this convention for any new component**; it's what keeps a future dark-mode toggle a one-line change instead of a rewrite.
  - ⚠️ **Existing exception**: `app/page.tsx` (the untouched `create-next-app` starter) hardcodes Tailwind palette classes directly — `bg-zinc-50`, `dark:bg-black`, `text-zinc-600`, `border-black/[.08]`, etc. — instead of the theme tokens. This predates the token system being wired up for real content; treat it as scaffolding to replace, not a pattern to copy.
- **Dark mode**: the `.dark` variant and a complete dark palette already exist in `globals.css` (`@custom-variant dark (&:is(.dark *))`), but nothing in the codebase currently toggles the `.dark` class — there's no theme switcher/provider. Dark mode is fully wired at the token level and inert at the application level; adding a toggle later should be structural (add the toggle + persist the class), not a token rewrite.
- **Spacing/radius**: standard Tailwind spacing scale; corner radius is token-driven off a single `--radius` base (`--radius-sm` through `--radius-4xl` are all `calc()`s of it in `@theme inline`) — don't hardcode `rounded-[Npx]` where a `--radius-*` token fits.
- **Layout primitives**: `TooltipProvider` wraps the whole app in `app/layout.tsx`; `components/ui/sidebar.tsx` is present (full shadcn sidebar system) but not yet mounted anywhere.
