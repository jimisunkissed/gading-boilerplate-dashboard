# Database

_Last verified: 2026-10-23, against the actual repo contents (Indexes section sourced from Google's MongoDB-compatibility docs; endpoints exercised only with the database unreachable)._

## Connection

`lib/config/firebase-mongo-config.ts` opens a single cached `MongoClient` (survives Next.js dev hot-reload via `global._mongoClientPromise`) against `process.env.FIRESTORE_MONGODB_URI` (set via `.env.example`). A code comment there calls this "a Firestore-compat connection... bound to one database" — i.e. this is MongoDB's wire protocol pointed at a Firestore-compatible backend, not a self-hosted MongoDB. That's consistent with the naming of everything in `lib/api/firebase-mongo-api.ts` (`*FirestoreMongo`) and with there being **no `$lookup`/aggregation-join usage anywhere in the codebase** — joins aren't available, so any two collections that need related data must either denormalize (copy the fields they need onto each other) or be fetched in two round trips and merged in application code.

`getDatabase()` takes no database-name argument — the target database is encoded in the URI itself. `getDedicatedClient()` exists for one-off scripts/migrations that need a non-pooled connection (`maxPoolSize: 1`).

## Collections

**No collection is created or read by any live route today.** `app/page.tsx`/`app/layout.tsx` don't touch the database, and the only two files that reference collection names are the inert `.example.ts` templates under `app/api/_template/` (see `docs/ARCHITECTURE.md` for why they don't run). Treat the two "collections" below as **placeholder examples to rename**, not a real schema:

### `items` (placeholder, from `crud-route.example.ts`)

Freeform — the template accepts any JSON object as `docData` and writes it as-is. No fields beyond the standard envelope (below) are enforced.

### `media` (placeholder, from `upload-route.example.ts`)

| Field | Type | Notes |
|---|---|---|
| `url` | `string` | Public R2 URL returned by `uploadFileR2` |
| `label` | `string \| null` | Optional caller-supplied field from the upload form |

## Standard document shape

Every document written through `lib/api/firebase-mongo-api.ts` gets this shape, enforced by the helpers themselves — don't set these fields by hand:

| Field | Type | Set by |
|---|---|---|
| `_id` | `string` | App-generated: `generateFirestoreId()` in `lib/utils/server/firebase-mongo-util.ts` — a random 20-character alphanumeric string, **not** a Mongo `ObjectId`. Returned to callers as `id` (helpers strip `_id` and spread `id: _id.toString()` instead). |
| `created_at` | `Date` | Stamped on first write (`addSingleFirestoreMongo`, or `setSingleFirestoreMongo`/`setBatchFirestoreMongo` on insert-via-upsert). Preserved on subsequent updates. |
| `updated_at` | `Date` | Stamped on every write. |

`setBatchFirestoreMongo` has a `persistDate` flag: when `true` it trusts `created_at`/`updated_at` already present on the incoming data (for migrations); when `false`/omitted it stamps them itself the same way the single-document helpers do.

## Field naming — snake_case only

Every field written to a Firestore/Mongo document must be **snake_case** (`created_at`, `updated_at`, `first_name`, ...), never camelCase. This is enforced by convention in `lib/api/firebase-mongo-api.ts` itself (the timestamp fields were renamed from `createdAt`/`lastUpdatedAt` to `created_at`/`updated_at`) and must be followed by any `docData`/`select`/`WhereClause.field`/`SortBy.field` value a caller passes in — the helpers don't transform casing for you, so a camelCase field name will just silently read/write/filter/sort on a field that doesn't match the rest of the document. TypeScript-side variables and function names stay camelCase as usual (see `docs/STYLEGUIDE.md`); this rule is scoped to document field names only.

## Filtering

`getMultipleFirestoreMongo` / `countDocumentsFirestoreMongo` / the `sum`/`avg`/`max`/`min` aggregation helpers all take a `WhereClause[]` (defined in `lib/utils/server/firebase-mongo-util.ts`). Supported operators: `eq`, `lt`, `lte`, `gt`, `gte`, `in`, `nin`, `exists`, `regex`, `elemMatch`. Multiple clauses are **AND-only** — there is no OR support in `buildMongoFilter`. Cursor pagination is supported via the `start` param (5th arg to `getMultipleFirestoreMongo`) combined with a `SortBy`; it appends a `gt`/`lt` clause on the sort field under the hood.

Full detail on which functions exist and their signatures: `docs/FUNCTIONS.md`.

## Indexes

Index management is built from four helpers in `lib/api/firebase-mongo-api.ts` (`createIndexFirestoreMongo`, `dropIndexFirestoreMongo`, `listIndexesFirestoreMongo`, `explainFirestoreMongo`), orchestration in `lib/api/database-index-api.ts`, and a registry in [lib/config/database-indexes.ts](../lib/config/database-indexes.ts) that is the source of truth for three dev-only endpoints (all 404 in production):

| Endpoint | Does |
|---|---|
| `POST /api/dev/database/create-index` | Requests every entry in `PENDING_INDEXES`, one every 30s in the background (`after()`), returning at once. Outcomes go to the server console. |
| `POST /api/dev/database/remove-index` | Drops every entry in `REMOVE_INDEXES` (sequential, outcomes in the response; an already-missing index counts as dropped). |
| `GET /api/dev/database/check-index` | Compares the registry with `listIndexes`. `?explain=true` also runs `explain` on each entry's `sample` query. |

`create-index` and `remove-index` accept an optional body: `{ "dryRun": true }` lists the plan without touching anything, `{ "collections": ["items"] }` limits the run. `create-index` rejects a second run while one is in progress (409). `createIndex` is idempotent, so re-sending an existing index is a no-op.

### Registry lifecycle

Fields are snake_case; order keys equality → sort → range. An entry is `{ key, usedBy, sample? }` where `sample` is a representative `{ filter, sort }` for `explain`.

1. A new query needs an index → add the entry to `PENDING_INDEXES`.
2. After `create-index` has been called → move it to `CREATED_INDEXES` under a dated comment (e.g. `// 23 Oct 2026`), so it is never re-sent but `check-index` still expects it. The commit id isn't known at that point; `git blame` on the entry recovers it later.
3. A query that needed an index is removed or changed → move the entry to `REMOVE_INDEXES`; after `remove-index`, delete it from `CREATED_INDEXES` and `REMOVE_INDEXES`, leaving a dated comment.

This is done at commit time, with the user's approval at each step — see rule 7 in `CLAUDE.md`. Claude never drops an index on its own, because the backend can't tell us an index is unused (below).

### `check-index` report (per collection)

| Field | Meaning |
|---|---|
| `ready` | Registered (created or pending) and present in `listIndexes`. |
| `pending_missing` | In `PENDING_INDEXES` but not in `listIndexes`: not sent yet, or still building. |
| `missing` | In `CREATED_INDEXES` but not in `listIndexes`: drift. |
| `to_remove_still_present` | In `REMOVE_INDEXES` and still in `listIndexes`. |
| `unregistered` | In `listIndexes` but in none of the registries (the built-in `_id_` index is ignored). |
| `explain` | Only with `?explain=true`: the backend's raw `executionStats` per entry that has a `sample`. |

"Ready" means present in `listIndexes`; the Mongo API can't prove a build has finished. `npm run db:check-index` (`scripts/check-index.ts`, run through `tsx`) is the same check without the dev server. It exits 0 when everything agrees, 2 when it finds differences and 1 when the check itself fails. A project `SessionStart` hook (`.claude/settings.json`, `asyncRewake`) runs it in the background at every session start and wakes Claude only on exit 2.

Indexes are a property of the Firestore-compat backend, so the rules below come from Google's [MongoDB compatibility indexing docs](https://docs.cloud.google.com/firestore/mongodb-compatibility/docs/indexing) and [supported-features pages](https://docs.cloud.google.com/firestore/mongodb-compatibility/docs/supported-features-50), not from stock MongoDB. Re-check them for the MongoDB API version your database uses.

### Creating an index in code

Use the helper rather than the raw driver. Index key names are document fields, so **snake_case**; the index is named like the driver's default (`category_1_created_at_-1`, via `getIndexName`) so `dropIndexFirestoreMongo` can find it from the key:

```ts
const result = await createIndexFirestoreMongo('items', { category: 1, created_at: -1 }); // string name | { error }
```

### What the backend allows

- **One index per request.** `createIndex()` and `runCommand({ createIndexes })` with a single index work; the plural `createIndexes()` helper does **not**. To create several, call `createIndex` once per index, sequentially.
- **Supported types:** single field, compound, multikey (array fields), text, 2dsphere. **Not supported:** 2d, hashed.
- **Supported options:** `sparse`, `unique`, TTL (`expireAfterSeconds`), `background`. **Not supported:** case-insensitive (collation), hidden, partial, wildcard.
- **Text and 2dsphere:** only one text index per collection. Both can be partitioned via `firestoreOptions.customPartitionFields` (max one field), and queries on a partitioned index must filter on that field.
- **Dropping:** `collection.dropIndex(nameOrSpec)` works (by name, e.g. `'category_created_at'`, or by key spec); `dropIndexes()` is not supported. Dropping the collection removes its indexes.

### Builds are slow and asynchronous

Index creation is a long-running operation, even on an empty database (a few minutes minimum), and it backfills existing documents. Don't assume the index is usable the instant the request returns. Don't call `createIndex` on every request or on app startup — create once, as a setup step (the endpoints above).

### What the backend can't tell us

- **No usage statistics.** `$indexStats` is unsupported and the docs describe no index-usage metrics, so "this index got no requests in 30 days" can't be measured through the Mongo API. Query Insights in the Google Cloud console is the closest thing; no way to read it from here was found.
- **No build status.** Whether an index finished building is only visible outside the Mongo API (`gcloud firestore operations list` / `describe`, which needs Google credentials separate from `FIRESTORE_MONGODB_URI`).
- **`explain` is per query.** It's supported (`executionStats`), but it can't observe real traffic, and the docs don't label a scan as index vs. full scan; read the returned records-scanned / post-filtered counts yourself. The output shape hasn't been checked against a live database.
- **Not verified:** whether `listIndexes` includes indexes still being built, and what a query does when no matching index exists (the docs only say no indexes exist by default; the Standard edition requires covered indexes, the Enterprise edition can run without).
