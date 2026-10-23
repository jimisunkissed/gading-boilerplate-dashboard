import { getDatabase } from '@/lib/config/firebase-mongo-config';
import {
  buildMongoFilter,
  buildProjection,
  generateFirestoreId,
  getIndexName,
  IndexKey,
  SortBy,
  toMongoDate,
  WhereClause,
} from '@/lib/utils/server/firebase-mongo-util';
import { Document, Condition, ObjectId, UpdateFilter, Filter, AnyBulkWriteOperation } from 'mongodb';

// ============================================================================
// TYPES
// ============================================================================

type DocResult = { id: string; [key: string]: unknown };
type ErrorResult = { error: string };

// ============================================================================
// BASIC CRUD OPERATIONS
// ============================================================================

export const getSingleFirestoreMongo = async (collectionName: string, docId: string, select?: string[]): Promise<DocResult | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const projection = buildProjection(select);
    const doc = await collection.findOne({ _id: docId } as Condition<ObjectId>, projection ? { projection } : {});

    if (!doc) {
      return { error: `Document ${docId} not found` };
    }

    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest };
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const getMultipleFirestoreByIdMongo = async (
  collectionName: string,
  docIds: string[],
  select?: string[]
): Promise<DocResult[] | ErrorResult> => {
  try {
    if (!docIds.length) return [];
    if (docIds.length > 100) return { error: 'Limit should be less than 100' };

    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const projection = buildProjection(select);
    const docs = await collection.find({ _id: { $in: docIds } } as Condition<ObjectId>, projection ? { projection } : {}).toArray();

    return docs.map(({ _id, ...rest }) => ({
      id: _id.toString(),
      ...rest,
    }));
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const getMultipleFirestoreMongo = async (
  collectionName: string,
  where: WhereClause[] = [],
  sortBy: SortBy | null = null,
  limit = 10,
  start: unknown | null = null,
  select?: string[]
): Promise<DocResult[] | ErrorResult> => {
  try {
    if (limit > 100) return { error: 'Limit should be less than 100' };

    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const mergedWhere = [...where];
    if (sortBy && start) {
      const operator = sortBy.direction === 'asc' ? 'gt' : 'lt';
      mergedWhere.push({ field: sortBy.field, operator, value: start });
    }

    const filter = buildMongoFilter(mergedWhere);
    const projection = buildProjection(select);

    let query = collection.find(filter, projection ? { projection } : {});

    if (sortBy) {
      const sortDir = sortBy.direction === 'asc' ? 1 : -1;
      query = query.sort({ [sortBy.field]: sortDir });
    }

    query = query.limit(limit);

    const docs = await query.toArray();

    return docs.map(({ _id, ...rest }) => ({
      id: _id.toString(),
      ...rest,
    }));
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const addSingleFirestoreMongo = async (collectionName: string, docData: Record<string, unknown>): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);
    const now = new Date();
    const docId = generateFirestoreId();

    const payload = {
      ...docData,
      _id: docId,
      created_at: now,
      updated_at: now,
    };

    await collection.insertOne(payload as Document);
    return docId;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const setSingleFirestoreMongo = async (
  collectionName: string,
  docId: string,
  docData: Record<string, unknown>
): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const data = { ...docData };
    delete data.id;
    delete data.created_at;
    delete data.updated_at;

    const now = new Date();
    const existing = await collection.findOne({ _id: docId } as Condition<ObjectId>);

    const payload: Record<string, unknown> = {
      ...data,
      updated_at: now,
      ...(!existing && { created_at: now }),
    };

    await collection.updateOne({ _id: docId } as Condition<ObjectId>, { $set: payload }, { upsert: true });

    return docId;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const setBatchFirestoreMongo = async (
  collectionName: string,
  docs: { docId: string; docData: Record<string, unknown> }[],
  persistDate: boolean
): Promise<{ ids: string[] } | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);
    const now = new Date();

    // Check which docs already exist so we only set created_at for new ones
    const existingDocs = await collection
      .find({ _id: { $in: docs.map((d) => d.docId) } } as Condition<ObjectId>)
      .project({ _id: 1 })
      .toArray();
    const existingIds = new Set(existingDocs.map((d) => d._id));

    const operations = docs.map(({ docId, docData }) => {
      const data = { ...docData };
      delete data.id;
      delete data.created_at;
      delete data.updated_at;

      const payload: Record<string, unknown> = persistDate
        ? {
            ...data,
            updated_at: toMongoDate(docData.updated_at) ?? now,
            created_at: toMongoDate(docData.created_at) ?? now,
          }
        : {
            ...data,
            updated_at: now,
            ...(!existingIds.has(docId) && { created_at: now }),
          };

      return {
        updateOne: {
          filter: { _id: docId },
          update: { $set: payload },
          upsert: true,
        },
      };
    });

    if (operations.length === 0) return { ids: [] };

    await collection.bulkWrite(operations as unknown as readonly AnyBulkWriteOperation<Document>[]);
    return { ids: docs.map((d) => d.docId) };
  } catch (error) {
    return { error: (error as Error).message };
  }
};

// Atomically increment (or decrement, with a negative delta) a numeric field.
// $inc creates the field starting from 0 if it doesn't exist yet.
export const incrementFirestoreMongo = async (
  collectionName: string,
  docId: string,
  field: string,
  delta: number = 1
): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);
    await collection.updateOne(
      { _id: docId } as Condition<ObjectId>,
      {
        $inc: { [field]: delta },
        $set: { updated_at: new Date() },
      } as UpdateFilter<Document>
    );
    return docId;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const deleteSingleFirestoreMongo = async (collectionName: string, docId: string): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    await collection.deleteOne({ _id: docId } as Condition<ObjectId>);
    return docId;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

// Atomically claim-and-update a single document in one round trip — the
// filter and the update run together server-side, so two callers racing on
// the same filter can never both get a non-null result back. Driver 6.21
// returns the document directly (not `{ value }`).
export const findOneAndUpdateFirestoreMongo = async (
  collectionName: string,
  filter: Filter<Document>,
  update: UpdateFilter<Document>
): Promise<DocResult | null> => {
  const db = await getDatabase();
  const collection = db.collection(collectionName);

  const doc = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after' });
  if (!doc) return null;

  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
};

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

export const countDocumentsFirestoreMongo = async (collectionName: string, where: WhereClause[] = []) => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const filter = buildMongoFilter(where);
    const count = await collection.countDocuments(filter);
    return count;
  } catch (error) {
    return (error as Error).message;
  }
};

export const sumDocumentsFirestoreMongo = async (collectionName: string, field: string, where: WhereClause[] = []) => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const filter = buildMongoFilter(where);
    const result = await collection.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: `$${field}` } } }]).toArray();

    return result[0]?.total ?? 0;
  } catch (error) {
    return (error as Error).message;
  }
};

export const avgDocumentsFirestoreMongo = async (collectionName: string, field: string, where: WhereClause[] = []) => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const filter = buildMongoFilter(where);
    const result = await collection.aggregate([{ $match: filter }, { $group: { _id: null, average: { $avg: `$${field}` } } }]).toArray();

    return result[0]?.average ?? 0;
  } catch (error) {
    return (error as Error).message;
  }
};

export const maxDocumentsFirestoreMongo = async (collectionName: string, field: string, where: WhereClause[] = []) => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const filter = buildMongoFilter(where);
    const result = await collection.aggregate([{ $match: filter }, { $group: { _id: null, maxValue: { $max: `$${field}` } } }]).toArray();

    return result[0]?.maxValue ?? null;
  } catch (error) {
    return (error as Error).message;
  }
};

export const minDocumentsFirestoreMongo = async (collectionName: string, field: string, where: WhereClause[] = []) => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const filter = buildMongoFilter(where);
    const result = await collection.aggregate([{ $match: filter }, { $group: { _id: null, minValue: { $min: `$${field}` } } }]).toArray();

    return result[0]?.minValue ?? null;
  } catch (error) {
    return (error as Error).message;
  }
};

// ============================================================================
// ARRAY OPERATIONS
// ============================================================================

export const arrayUnionFirestoreMongo = async (
  collectionName: string,
  docId: string,
  fieldName: string,
  elements: unknown
): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const now = new Date();
    const values = Array.isArray(elements) ? elements : [elements];

    await collection.updateOne(
      { _id: docId } as Condition<ObjectId>,
      {
        $addToSet: { [fieldName]: { $each: values } },
        $set: { updated_at: now },
        $setOnInsert: { created_at: now },
      } as unknown as UpdateFilter<Document>,
      { upsert: true }
    );

    return docId;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const arrayRemoveFirestoreMongo = async (
  collectionName: string,
  docId: string,
  fieldName: string,
  elements: unknown
): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    const collection = db.collection(collectionName);

    const values = Array.isArray(elements) ? elements : [elements];

    await collection.updateOne(
      { _id: docId } as Condition<ObjectId>,
      {
        $pull: { [fieldName]: { $in: values } },
        $set: { updated_at: new Date() },
      } as unknown as UpdateFilter<Document>
    );

    return docId;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

// ============================================================================
// INDEXES
// Backend limits (one index per request, no partial/wildcard/hashed, no $indexStats) are in docs/DATABASE.md.
// ============================================================================

export type IndexInfo = { name: string; key: IndexKey };

export const createIndexFirestoreMongo = async (collectionName: string, key: IndexKey): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    // explicit name = the driver's default format, so dropIndexFirestoreMongo(getIndexName(key)) always finds it
    return await db.collection(collectionName).createIndex(key, { name: getIndexName(key) });
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export const dropIndexFirestoreMongo = async (collectionName: string, indexName: string): Promise<string | ErrorResult> => {
  try {
    const db = await getDatabase();
    await db.collection(collectionName).dropIndex(indexName);
    return indexName;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

// A collection that doesn't exist yet has no indexes, so it lists as [] instead of erroring.
export const listIndexesFirestoreMongo = async (collectionName: string): Promise<IndexInfo[] | ErrorResult> => {
  try {
    const db = await getDatabase();
    const indexes = await db.collection(collectionName).listIndexes().toArray();
    return indexes.map(({ name, key }) => ({ name: name as string, key: key as IndexKey }));
  } catch (error) {
    if ((error as { code?: number }).code === 26) return [];
    return { error: (error as Error).message };
  }
};

// executionStats-level explain for one find(). The output shape is the backend's own and is returned untouched.
export const explainFirestoreMongo = async (
  collectionName: string,
  filter: Filter<Document> = {},
  sort?: IndexKey
): Promise<Document | ErrorResult> => {
  try {
    const db = await getDatabase();
    let query = db.collection(collectionName).find(filter);
    if (sort) query = query.sort(sort);
    return await query.explain('executionStats');
  } catch (error) {
    return { error: (error as Error).message };
  }
};
