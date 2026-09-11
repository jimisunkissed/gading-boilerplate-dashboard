import { Document, Filter } from 'mongodb';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export type WhereClause = {
  field: string;
  operator:
    | 'eq' // Equal to. { field: 'status', operator: 'eq', value: 'active' }
    | 'lt' // Less than. { field: 'age', operator: 'lt', value: 30 }
    | 'lte' // Less than or equal to. { field: 'age', operator: 'lte', value: 30 }
    | 'gt' // Greater than. { field: 'price', operator: 'gt', value: 100 }
    | 'gte' // Greater than or equal to. { field: 'price', operator: 'gte', value: 100 }
    | 'in' // Value exists in array. { field: 'role', operator: 'in', value: ['admin', 'editor'] }
    | 'nin' // Value does not exist in array. { field: 'role', operator: 'nin', value: ['banned', 'suspended'] }
    | 'exists' // Field exists (true) or is absent (false). { field: 'deletedAt', operator: 'exists', value: false }
    | 'regex' // Matches a regular expression pattern. { field: 'email', operator: 'regex', value: '@gmail\\.com$' }
    | 'elemMatch'; // At least one array element matches all conditions. { field: 'orders', operator: 'elemMatch', value: { status: 'pending', total: { $gt: 50 } } }
  value: unknown;
};

export type SortBy = {
  field: string;
  direction: 'asc' | 'desc';
};

export const buildProjection = (select?: string[]): Record<string, 1> | undefined => {
  if (!select || select.length === 0) return undefined;
  return select.reduce((acc, field) => ({ ...acc, [field]: 1 }), {});
};

// Helper to convert WhereClause to MongoDB filter
export function buildMongoFilter(whereClause: WhereClause[]): Filter<Document> {
  if (!Array.isArray(whereClause) || whereClause.length === 0) {
    return {};
  }

  const filters: Filter<Document>[] = [];

  whereClause.forEach((w) => {
    const field = w.field;

    switch (w.operator) {
      case 'eq':
        filters.push({ [field]: w.value });
        break;
      case 'lt':
        filters.push({ [field]: { $lt: w.value } });
        break;
      case 'lte':
        filters.push({ [field]: { $lte: w.value } });
        break;
      case 'gt':
        filters.push({ [field]: { $gt: w.value } });
        break;
      case 'gte':
        filters.push({ [field]: { $gte: w.value } });
        break;
      case 'in':
        filters.push({ [field]: { $in: w.value as unknown[] } });
        break;
      case 'nin':
        filters.push({ [field]: { $nin: w.value as unknown[] } });
        break;
      case 'exists':
        filters.push({ [field]: { $exists: w.value } });
        break;
      case 'regex':
        filters.push({ [field]: { $regex: w.value as string, $options: 'i' } });
        break;
      case 'elemMatch':
        filters.push({ [field]: { $elemMatch: w.value } });
        break;
      default:
        filters.push({ [field]: w.value });
    }
  });

  return filters.length === 1 ? filters[0] : { $and: filters };
}

export function generateFirestoreId(length = 20): string {
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += CHARS[array[i] % CHARS.length];
  }
  return result;
}

export function toMongoDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds ?? 0) / 1e6));
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6));

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}
