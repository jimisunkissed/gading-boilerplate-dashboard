import { MongoClient, Db, MongoClientOptions } from 'mongodb';

const uri = process.env.FIRESTORE_MONGODB_URI;

if (!uri) {
  throw new Error('Please define FIRESTORE_MONGODB_URI in .env.local');
}

const options: MongoClientOptions = {
  maxPoolSize: 10,
  maxIdleTimeMS: 60_000, // retire idle sockets before the LB drops them
  socketTimeoutMS: 60_000, // fail fast on a dead socket instead of hanging
  // no minPoolSize in serverless — let the pool grow on demand
};

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): Promise<MongoClient> {
  return new MongoClient(uri!, options).connect();
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // survive Next.js hot-reload module re-evaluation
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClient();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = createClient();
}

export async function getClient(): Promise<MongoClient> {
  try {
    return await clientPromise;
  } catch (err) {
    // drop the poisoned promise so the next call retries a fresh connect
    const fresh = createClient();
    clientPromise = fresh;
    if (process.env.NODE_ENV === 'development') {
      global._mongoClientPromise = fresh;
    }
    throw err;
  }
}

export async function getDatabase(): Promise<Db> {
  const client = await getClient();
  // No argument: bind to the DATABASE_ID encoded in the URI.
  // Don't pass a name — a Firestore-compat connection is bound to one database.
  return client.db();
}

export async function getDedicatedClient(): Promise<MongoClient> {
  const client = new MongoClient(uri!, {
    ...options,
    maxPoolSize: 1,
    maxIdleTimeMS: 0,
  });
  return client.connect();
}
