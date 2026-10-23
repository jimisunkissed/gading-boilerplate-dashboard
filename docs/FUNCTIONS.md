# Functions reference

_Last verified: 2026-10-23, against the actual repo contents. Reuse one of these before writing new inline logic that duplicates what's already here._

## Database — `lib/api/firebase-mongo-api.ts`

The prebuilt database helpers (standing rule: reach for these first; see `docs/DATABASE.md` for filter operators and the document shape they enforce). All take a `collectionName: string` as the first argument. Except where noted, failures are returned as `{ error: string }` rather than thrown. **All document field names — in `docData`, `select`, `WhereClause.field`, `SortBy.field` — must be snake_case**, matching `created_at`/`updated_at` (see `docs/DATABASE.md`).

| Function | Signature | Does |
|---|---|---|
| `getSingleFirestoreMongo` | `(collectionName, docId, select?) => Promise<DocResult \| ErrorResult>` | Fetch one document by id. `select` limits returned fields. |
| `getMultipleFirestoreByIdMongo` | `(collectionName, docIds, select?) => Promise<DocResult[] \| ErrorResult>` | Batch fetch by id list, max 100. |
| `getMultipleFirestoreMongo` | `(collectionName, where?, sortBy?, limit?, start?, select?) => Promise<DocResult[] \| ErrorResult>` | List with filtering (`WhereClause[]`), sorting, and cursor pagination (`start` = last sort-field value). `limit` max 100, default 10. |
| `addSingleFirestoreMongo` | `(collectionName, docData) => Promise<string \| ErrorResult>` | Insert with an internally generated id. Returns the new id. |
| `setSingleFirestoreMongo` | `(collectionName, docId, docData) => Promise<string \| ErrorResult>` | Upsert by id (create-or-update). Strips any `id`/`created_at`/`updated_at` from `docData` first and re-stamps them. |
| `setBatchFirestoreMongo` | `(collectionName, docs, persistDate) => Promise<{ ids: string[] } \| ErrorResult>` | Bulk upsert. `persistDate: true` trusts incoming `created_at`/`updated_at` (migrations); `false` stamps them like the single-doc helper. |
| `incrementFirestoreMongo` | `(collectionName, docId, field, delta = 1) => Promise<string \| ErrorResult>` | Atomic `$inc` on a numeric field (negative `delta` to decrement). |
| `deleteSingleFirestoreMongo` | `(collectionName, docId) => Promise<string \| ErrorResult>` | Delete by id. |
| `findOneAndUpdateFirestoreMongo` | `(collectionName, filter, update) => Promise<DocResult \| null>` | Atomic claim-and-update in one round trip (e.g. for locking/claiming a job). **Throws** on connection failure instead of returning `{ error }`; returns `null` if nothing matched. |
| `countDocumentsFirestoreMongo` | `(collectionName, where?) => Promise<number \| string>` | Count matching documents. Returns the error message string (not `{ error }`) on failure. |
| `sumDocumentsFirestoreMongo` | `(collectionName, field, where?) => Promise<number \| string>` | `$sum` aggregate over `field`. |
| `avgDocumentsFirestoreMongo` | `(collectionName, field, where?) => Promise<number \| string>` | `$avg` aggregate. |
| `maxDocumentsFirestoreMongo` | `(collectionName, field, where?) => Promise<number \| null \| string>` | `$max` aggregate. |
| `minDocumentsFirestoreMongo` | `(collectionName, field, where?) => Promise<number \| null \| string>` | `$min` aggregate. |
| `arrayUnionFirestoreMongo` | `(collectionName, docId, fieldName, elements) => Promise<string \| ErrorResult>` | `$addToSet` — append value(s) to an array field without duplicates. Upserts if the doc doesn't exist. |
| `arrayRemoveFirestoreMongo` | `(collectionName, docId, fieldName, elements) => Promise<string \| ErrorResult>` | `$pull` — remove matching value(s) from an array field. |

| `createIndexFirestoreMongo` | `(collectionName, key: IndexKey) => Promise<string \| ErrorResult>` | `createIndex` named with `getIndexName(key)`. One index per call; see `docs/DATABASE.md` for backend limits. |
| `dropIndexFirestoreMongo` | `(collectionName, indexName) => Promise<string \| ErrorResult>` | `dropIndex` by name. |
| `listIndexesFirestoreMongo` | `(collectionName) => Promise<IndexInfo[] \| ErrorResult>` | `listIndexes` as `{ name, key }[]`; a collection that doesn't exist lists as `[]`. |
| `explainFirestoreMongo` | `(collectionName, filter?, sort?) => Promise<Document \| ErrorResult>` | `find().sort().explain('executionStats')`, returned untouched. |

Note the inconsistency: the five aggregation functions (`count`/`sum`/`avg`/`max`/`min`) return a bare error **string** on failure, while every CRUD/array helper returns `{ error: string }`. Callers need `isErrorResult()`-style checks for CRUD calls, but a plain `typeof result === 'string'` check for the aggregation calls.

## Database — supporting types/helpers — `lib/utils/server/firebase-mongo-util.ts`

| Export | Signature | Does |
|---|---|---|
| `WhereClause` (type) | `{ field, operator, value }` | `operator` is one of `eq \| lt \| lte \| gt \| gte \| in \| nin \| exists \| regex \| elemMatch`. |
| `SortBy` (type) | `{ field, direction: 'asc' \| 'desc' }` | |
| `buildProjection` | `(select?: string[]) => Record<string,1> \| undefined` | Turns a field list into a Mongo projection. |
| `buildMongoFilter` | `(whereClause: WhereClause[]) => Filter<Document>` | Turns `WhereClause[]` into a Mongo filter. AND-only across clauses. |
| `generateFirestoreId` | `(length = 20) => string` | Random alphanumeric id, used for every document `_id`. |
| `IndexKey` (type) | `Record<string, 1 \| -1>` | Index key pattern, e.g. `{ status: 1, created_at: -1 }`. |
| `getIndexName` | `(key: IndexKey) => string` | The driver's default index name format (`status_1_created_at_-1`). |
| `toMongoDate` | `(value: any) => Date \| null` | Coerces `Date`, Firestore Timestamp-like objects (`{_seconds}`/`{seconds}`/`.toDate()`), or parseable strings into a `Date`. |

## Database indexes — `lib/api/database-index-api.ts`

Orchestration behind the dev endpoints in `docs/DATABASE.md`; registry types and data live in `lib/config/database-indexes.ts` (`PENDING_INDEXES`, `CREATED_INDEXES`, `REMOVE_INDEXES`). Dev-route response helpers (`ok`, `fail`, `devOnlyGuard`) are in `lib/utils/server/dev-route-util.ts`.

| Export | Signature | Does |
|---|---|---|
| `planIndexes` | `(registry, collections?) => IndexQueueItem[] \| { error }` | Flattens a registry into a queue; errors on unknown collection names. |
| `createIndexesStaggered` | `(queue) => Promise<void>` | Fires one `createIndexFirestoreMongo` every `INDEX_STAGGER_MS` (30s) without awaiting each; logs outcomes only. |
| `dropIndexes` | `(queue) => Promise<DropOutcome[]>` | Sequential drops; an already-missing index counts as dropped. |
| `checkIndexes` | `({ explain? }) => Promise<IndexCheck>` | Per-collection `ready` / `pending_missing` / `missing` / `to_remove_still_present` / `unregistered` (+ `explain`). |

## Storage — `lib/api/r2-api.ts`

The prebuilt storage helpers (standing rule: never call the S3 SDK directly in a route — go through these). Unlike the database helpers, these **throw** on failure.

| Function | Signature | Does |
|---|---|---|
| `uploadFileR2` | `(buffer: Buffer, key: string, contentType: string) => Promise<string>` | Uploads and returns the public URL. `key` should not start with `/`. |
| `extractKeyR2` | `(url: string) => string \| null` | Pulls the storage key back out of a public URL (works because the bucket base URL maps directly onto the bucket root). |
| `deleteFileR2` | `(url: string) => Promise<void>` | Deletes by public URL (internally calls `extractKeyR2`). |

`lib/config/r2-config.ts` exports the underlying `r2: S3Client` singleton these are built on — routes should never import this directly.

## Date — `lib/utils/client/date-util.ts` (client-safe, uses `date-fns`)

| Export | Signature | Does |
|---|---|---|
| `getMinuteDifference` | `(start?, end?) => number` | Minutes between two date-like values (string/number). Returns `0` if either is missing. |
| `CalendarMonths` | `CalendarMonthsType[]` | Static month list (`name`/`abb`/`num`). |
| `getCalendarDates` | `(month: number, year: number) => { date: Date; padding: boolean }[]` | Full calendar grid for a month (Sun-start weeks), including leading/trailing days from adjacent months flagged via `padding`. Throws on out-of-range month/year. |
| `isDateRangeOverlap` | `(range1, range2) => boolean` | Range overlap check; a `null` `end_date` is treated as open-ended (year 9999). |

## Numbers — `lib/utils/client/number-util.ts`

| Export | Signature | Does |
|---|---|---|
| `formatNumber` | `(num, separator = '.') => string` | Thousands-separator formatting. |
| `formatMinutes` | `(duration?: number) => string` | Minutes → `"1j 30m"`-style string (Indonesian hour/minute abbreviations). |
| `formatNumberSuffix` | `(num, decimals = 0) => string` | Compact number: `k` (thousand), `jt` (million, Indonesian "juta"), `m` (billion, Indonesian "milyar"). |

## Images — client — `lib/utils/client/image-util.ts` (browser-only: canvas + `browser-image-compression`)

| Export | Signature | Does |
|---|---|---|
| `processImage` | `(file: File, options?: ProcessImageOptions) => Promise<File>` | Crops to a target aspect ratio (or clamps into an `aspectRatioRange`) via `<canvas>`, then compresses with `browser-image-compression`. Reach for this instead of hand-rolling crop/compress logic in a component. |

## Images — server — `lib/utils/server/image-util.ts` (Node-only, uses `sharp`)

| Export | Signature | Does |
|---|---|---|
| `getImageMetadata` | `(buffer: Buffer) => Promise<ImageMetadata>` | `{ type: 'image', size, ar, width, height }`. |
| `convertToWebP` | `(buffer, options?) => Promise<Buffer>` | Optional resize (`fit`/`position`) + WebP encode. Used internally by `lib/utils/server/video-util.ts` for thumbnails too. |

## Video — client — `lib/utils/client/video-util.ts` (browser-only, uses `@ffmpeg/ffmpeg` wasm loaded from a CDN at runtime)

| Export | Signature | Does |
|---|---|---|
| `createVideoThumbnail` | `(file: File, options?: { seekTo?, aspectRatio? }) => Promise<string>` | Object-URL PNG/blob thumbnail via `<video>`/`<canvas>` (no ffmpeg needed for this one). |
| `getVideoMetadata` | `(videoFile: File) => Promise<VideoMetadata>` | `{ type: 'video', size, ar, width, height, duration }` read via a `<video>` element. |
| `processVideo` | `(videoFile: File, options?: ProcessVideoOptions) => Promise<Blob>` | Crop/scale/trim/bitrate-cap an MP4 via ffmpeg.wasm; lazily loads the ffmpeg core from `unpkg.com` on first use. |

## Video — server — `lib/utils/server/video-util.ts` (Node-only, uses `fluent-ffmpeg` — requires an `ffmpeg` binary available to the process, writes temp files via `fs`/`os`)

| Export | Signature | Does |
|---|---|---|
| `getVideoMetadata` | `(buffer: Buffer) => Promise<VideoMetadata>` | Via `ffprobe`. |
| `createVideoThumbnail` | `(buffer: Buffer) => Promise<Buffer>` | First frame → WebP (delegates encoding to `convertToWebP` from the server image util). |
| `convertToWebM` | `(buffer, options?: ConvertToVideoOptions) => Promise<Buffer>` | VP9/Opus transcode with optional scale/crop/quality/duration. |
| `convertToMP4` | `(buffer, options?: ConvertToVideoOptions) => Promise<Buffer>` | H.264/AAC transcode, same option shape as `convertToWebM`. |

## Files/MIME — `lib/utils/server/file-util.ts` (Node-safe, no deps)

| Export | Signature | Does |
|---|---|---|
| `getFileFormat` | `(buffer: Buffer) => string` | Sniffs magic bytes → `'jpg' \| 'png' \| 'webp' \| 'gif' \| 'mp4' \| 'webm' \| 'avi' \| 'mov' \| 'bin'`. |
| `getMimeType` | `(format: string) => string` | Extension → MIME type, defaults to `application/octet-stream`. |

## Media/URL — `lib/utils/server/media-util.ts` (Node-safe, no heavy deps)

| Export | Signature | Does |
|---|---|---|
| `getFileExtension` | `(url: string) => string \| null` | Extracts the extension from a URL path. |
| `getMediaType` | `(url: string) => 'image' \| 'video' \| 'unknown'` | Classifies by extension. |
| `createBufferFromUrl` | `(url: string) => Promise<{ buffer, filename, mimeType }>` | Fetches a remote URL into a `Buffer` (e.g. to re-upload something from an external source into R2). |

## Misc — `lib/utils.ts`

Re-exports `cn` from the `cn` npm package (the official shadcn `clsx` + `tailwind-merge` replacement) — not a local implementation. Import `cn` from `@/lib/utils` as usual for combining Tailwind class names conditionally.

## State — `lib/stores/app-store.ts`

`useAuthStore` (zustand) — `{ loaded, signed_in, user: { created_at, updated_at, id, email, username, first_name, last_name, full_name } }` plus `setLoaded`, `setSignedIn`, `setUser`. Only store in the codebase today.

⚠️ `setUser` computes and spreads a `name` field (`[first_name, last_name].filter(Boolean).join(' ')`) onto `user`, but the `AuthStoreProps['user']` type only declares `full_name`, not `name` — the computed field is silently untyped/unused by consumers. Worth reconciling (rename to `full_name`, or add `name` to the type) before building UI on top of it.

## Hooks — `hooks/use-mobile.ts`

`useIsMobile()` — boolean, `true` under a 768px `matchMedia` breakpoint, client-only (uses `window`).
