import type { IndexKey } from '@/lib/utils/server/firebase-mongo-util';

// ============================================================================
// INDEX REGISTRY
//
// Source of truth for the dev endpoints under app/api/dev/database/ and the
// `npm run db:check-index` script. Backend limits and the commit-time workflow
// are in docs/DATABASE.md ("Indexes") and CLAUDE.md (rule 7).
//
// Lifecycle of an entry:
//   PENDING_INDEXES  -> sent by POST /api/dev/database/create-index
//   (after the run, move it to CREATED_INDEXES under a dated comment, so it is
//    never re-sent but check-index still knows it should exist)
//   REMOVE_INDEXES   -> dropped by POST /api/dev/database/remove-index
//   (after the run, delete it from CREATED_INDEXES and from here, leaving a
//    dated comment)
//
// Rules: field names are snake_case. Order keys Equality -> Sort -> Range (ESR).
// When a query only conditionally adds an equality field, each combination that
// can actually be produced gets its own index, because a compound index can only
// serve a query whose equality fields form a prefix of the key. Unanchored
// `regex` filters can never use index bounds, so the keyword variant of a query
// shares the index of its no-keyword variant. `_id` lookups use the built-in
// _id index and need nothing here.
// ============================================================================

export type IndexEntry = {
  key: IndexKey;
  // where the index is used — a route, a page, a query
  usedBy: string;
  // optional representative query; check-index runs `explain` on it (?explain=true)
  sample?: { filter: Record<string, unknown>; sort?: IndexKey };
};

export type IndexRegistry = Record<string, IndexEntry[]>;

export const PENDING_INDEXES: IndexRegistry = {
  // placeholder collection from app/api/_template/crud-route.example.ts — rename with it
  items: [
    {
      key: { created_at: -1 },
      usedBy: 'crud GET (list, ordered by created_at desc)',
      sample: { filter: {}, sort: { created_at: -1 } },
    },
  ],
};

export const CREATED_INDEXES: IndexRegistry = {
  // <dd Mon yyyy>
  // collection: [{ key: {...}, usedBy: '...' }],
};

export const REMOVE_INDEXES: IndexRegistry = {
  // collection: [{ key: {...}, usedBy: 'why it is stale' }],
};
