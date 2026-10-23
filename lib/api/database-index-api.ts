import {
  createIndexFirestoreMongo,
  dropIndexFirestoreMongo,
  explainFirestoreMongo,
  listIndexesFirestoreMongo,
} from '@/lib/api/firebase-mongo-api';
import { CREATED_INDEXES, IndexEntry, IndexRegistry, PENDING_INDEXES, REMOVE_INDEXES } from '@/lib/config/database-indexes';
import { getIndexName } from '@/lib/utils/server/firebase-mongo-util';

export const INDEX_STAGGER_MS = 30_000;

export type IndexQueueItem = { collection: string; entry: IndexEntry; label: string };

const isErrorResult = (value: unknown): value is { error: string } => !!value && typeof value === 'object' && 'error' in value;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Flattens a registry into a queue, optionally limited to some collections.
// Returns { error } naming the unknown collection(s) instead of silently skipping them.
export const planIndexes = (registry: IndexRegistry, collections?: string[]): IndexQueueItem[] | { error: string } => {
  const requested = collections?.length ? collections : Object.keys(registry);
  const unknown = requested.filter((name) => !registry[name]);
  if (unknown.length) return { error: `Unknown collections: ${unknown.join(', ')}. Available: ${Object.keys(registry).join(', ') || 'none'}` };

  return requested.flatMap((collection) => registry[collection].map((entry) => ({ collection, entry, label: getIndexName(entry.key) })));
};

// Starts one createIndex every INDEX_STAGGER_MS without waiting for the previous one to finish, so a slow build
// (or the driver's socketTimeoutMS firing first) never blocks the queue. Outcomes are only logged:
// a timeout here means "client stopped waiting", NOT "index was not created" — confirm with check-index.
export async function createIndexesStaggered(queue: IndexQueueItem[]): Promise<void> {
  const pending: Promise<void>[] = [];

  for (const [i, { collection, entry, label }] of queue.entries()) {
    console.log(`[create-index] ${i + 1}/${queue.length} starting ${collection} (${label})`);
    pending.push(
      createIndexFirestoreMongo(collection, entry.key).then((result) =>
        isErrorResult(result)
          ? console.error(`[create-index] ${collection} (${label}) unconfirmed: ${result.error}`)
          : console.log(`[create-index] ${collection} (${label}) -> ${result}`)
      )
    );

    if (i < queue.length - 1) await sleep(INDEX_STAGGER_MS);
  }

  await Promise.allSettled(pending);
  console.log(`[create-index] done, ${queue.length} requests sent`);
}

export type DropOutcome = { collection: string; index: string; dropped: boolean; error?: string };

// Drops are quick, so they run one after another and are awaited. An index that is already gone counts as dropped.
export async function dropIndexes(queue: IndexQueueItem[]): Promise<DropOutcome[]> {
  const outcomes: DropOutcome[] = [];
  for (const { collection, label } of queue) {
    const result = await dropIndexFirestoreMongo(collection, label);
    const alreadyGone = isErrorResult(result) && /not found|ns not found|index not found/i.test(result.error);
    outcomes.push(
      isErrorResult(result) && !alreadyGone
        ? { collection, index: label, dropped: false, error: result.error }
        : { collection, index: label, dropped: true }
    );
  }
  return outcomes;
}

export type IndexCheckReport = {
  // registered (created or pending) and present in listIndexes
  ready: string[];
  // PENDING entry not in listIndexes: not sent yet, or still building (build status isn't visible through the Mongo API)
  pending_missing: string[];
  // CREATED entry not in listIndexes: drift, it should exist
  missing: string[];
  // REMOVE entry still in listIndexes: waiting for remove-index
  to_remove_still_present: string[];
  // in listIndexes but in none of the three registries (the built-in _id_ index is ignored)
  unregistered: string[];
  // only with { explain: true }: raw executionStats per entry that has a `sample`
  explain?: { index: string; execution_stats: unknown }[];
  error?: string;
};

export type IndexCheck = { collections: Record<string, IndexCheckReport> };

// Compares the registries with what listIndexes reports for every collection mentioned in any of them.
// "Ready" means present in listIndexes — the Mongo API cannot prove a build has finished.
export async function checkIndexes({ explain = false }: { explain?: boolean } = {}): Promise<IndexCheck> {
  const collections = new Set([...Object.keys(CREATED_INDEXES), ...Object.keys(PENDING_INDEXES), ...Object.keys(REMOVE_INDEXES)]);
  const report: IndexCheck['collections'] = {};

  for (const collection of collections) {
    const created = CREATED_INDEXES[collection] ?? [];
    const pending = PENDING_INDEXES[collection] ?? [];
    const remove = REMOVE_INDEXES[collection] ?? [];

    const live = await listIndexesFirestoreMongo(collection);
    if (isErrorResult(live)) {
      report[collection] = { ready: [], pending_missing: [], missing: [], to_remove_still_present: [], unregistered: [], error: live.error };
      continue;
    }

    const liveNames = new Set(live.map(({ key }) => getIndexName(key)));
    const names = (entries: IndexEntry[]) => entries.map(({ key }) => getIndexName(key));
    const known = new Set([...names(created), ...names(pending), ...names(remove), '_id_1']);

    const entry: IndexCheckReport = {
      ready: [...names(created), ...names(pending)].filter((name) => liveNames.has(name)),
      pending_missing: names(pending).filter((name) => !liveNames.has(name)),
      missing: names(created).filter((name) => !liveNames.has(name)),
      to_remove_still_present: names(remove).filter((name) => liveNames.has(name)),
      unregistered: [...liveNames].filter((name) => !known.has(name)),
    };

    if (explain) {
      entry.explain = [];
      for (const { key, sample } of [...created, ...pending]) {
        if (!sample) continue;
        const stats = await explainFirestoreMongo(collection, sample.filter, sample.sort);
        entry.explain.push({ index: getIndexName(key), execution_stats: stats });
      }
    }

    report[collection] = entry;
  }

  return { collections: report };
}
