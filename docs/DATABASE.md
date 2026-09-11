# Database

_Last verified: 2026-09-12, against the actual repo contents._

## Connection

`lib/config/firebase-mongo-config.ts` opens a single cached `MongoClient` (survives Next.js dev hot-reload via `global._mongoClientPromise`) against `process.env.FIRESTORE_MONGODB_URI`. A code comment there calls this "a Firestore-compat connection... bound to one database" — i.e. this is MongoDB's wire protocol pointed at a Firestore-compatible backend, not a self-hosted MongoDB. That's consistent with the naming of everything in `lib/api/firebase-mongo-api.ts` (`*FirestoreMongo`) and with there being **no `$lookup`/aggregation-join usage anywhere in the codebase** — joins aren't available, so any two collections that need related data must either denormalize (copy the fields they need onto each other) or be fetched in two round trips and merged in application code.

⚠️ **Env var name mismatch** (see `docs/ARCHITECTURE.md`): `.env.example` defines `FIREBASE_MONGODB_URI`, but the config file reads `FIRESTORE_MONGODB_URI`. Reconcile before connecting to a real database.

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
| `createdAt` | `Date` | Stamped on first write (`addSingleFirestoreMongo`, or `setSingleFirestoreMongo`/`setBatchFirestoreMongo` on insert-via-upsert). Preserved on subsequent updates. |
| `lastUpdatedAt` | `Date` | Stamped on every write. |

`setBatchFirestoreMongo` has a `persistDate` flag: when `true` it trusts `createdAt`/`lastUpdatedAt` already present on the incoming data (for migrations); when `false`/omitted it stamps them itself the same way the single-document helpers do.

## Filtering

`getMultipleFirestoreMongo` / `countDocumentsFirestoreMongo` / the `sum`/`avg`/`max`/`min` aggregation helpers all take a `WhereClause[]` (defined in `lib/utils/server/firebase-mongo-util.ts`). Supported operators: `eq`, `lt`, `lte`, `gt`, `gte`, `in`, `nin`, `exists`, `regex`, `elemMatch`. Multiple clauses are **AND-only** — there is no OR support in `buildMongoFilter`. Cursor pagination is supported via the `start` param (5th arg to `getMultipleFirestoreMongo`) combined with a `SortBy`; it appends a `gt`/`lt` clause on the sort field under the hood.

Full detail on which functions exist and their signatures: `docs/FUNCTIONS.md`.
