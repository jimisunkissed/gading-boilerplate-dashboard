import { NextRequest, NextResponse } from "next/server";
import {
  getSingleFirestoreMongo,
  getMultipleFirestoreByIdMongo,
  getMultipleFirestoreMongo,
  setSingleFirestoreMongo,
  setBatchFirestoreMongo,
  deleteSingleFirestoreMongo,
} from "@/lib/api/firebase-mongo-api";
import { generateFirestoreId, SortBy, WhereClause } from "@/lib/utils/server/firebase-mongo-util";

const COLLECTION = "items"; // replace with your collection name

/**
 * ── RESPONSE ENVELOPE ─────────────────────────────────────────────
 * Every API route in this project returns one of these two shapes.
 * Do not invent a different response shape in a new route.
 */
type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; error: string };

function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status });
}

function fail(error: string, status = 400) {
  return NextResponse.json<ApiError>({ success: false, error }, { status });
}

/**
 * firebase-mongo-api helpers return `{ error: string }` on failure
 * instead of throwing — so every call needs this check *in addition*
 * to the outer try/catch (which only catches unexpected/connection
 * failures, not expected ones like "not found").
 */
function isErrorResult(value: unknown): value is { error: string } {
  return !!value && typeof value === "object" && "error" in value;
}

/**
 * ── GET ──────────────────────────────────────────────────────────
 * Three shapes handled here, all via predefined helpers:
 *   1. GET /api/items?id=abc123         -> single document
 *   2. GET /api/items?ids=abc123,def456 -> batch by ids (max 100)
 *   3. GET /api/items                   -> list, ordered, optionally filtered
 *
 * getMultipleFirestoreMongo already supports filtering (via `where`)
 * and cursor-based pagination (via `start`) — there should rarely be
 * a need to reach for anything outside these six helpers. If you hit
 * a real case none of them cover, that's the signal to add a new
 * helper to firebase-mongo-api, not to write raw driver code inline.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");

    if (id) {
      const result = await getSingleFirestoreMongo(COLLECTION, id);
      if (isErrorResult(result)) return fail(result.error, 404);
      return ok(result);
    }

    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      const result = await getMultipleFirestoreByIdMongo(COLLECTION, ids);
      if (isErrorResult(result)) return fail(result.error, 400);
      return ok(result);
    }

    // Simple ordered list, no filter.
    const sortBy: SortBy = { field: "created_at", direction: "desc" };
    const result = await getMultipleFirestoreMongo(COLLECTION, [], sortBy, 50);
    if (isErrorResult(result)) return fail(result.error, 400);
    return ok(result);

    // ── Need to filter/search instead of a plain list? Build a
    // WhereClause[] and pass it in place of the empty array above.
    // Check firebase-mongo-util.ts for the exact operator strings
    // buildMongoFilter() supports before relying on this.
    //
    // const where: WhereClause[] = [
    //   { field: "name", operator: "eq", value: search },
    // ];
    // const result = await getMultipleFirestoreMongo(COLLECTION, where, sortBy, 50);
    //
    // ── Need pagination past the first page? Pass the last item's
    // sort-field value as `start` (5th arg) to get the next cursor page:
    //
    // const result = await getMultipleFirestoreMongo(COLLECTION, [], sortBy, 50, lastCreatedAt);
  } catch (err) {
    console.error(`GET /api/${COLLECTION} failed:`, err);
    return fail("Something went wrong fetching data", 500);
  }
}

/**
 * ── POST ─────────────────────────────────────────────────────────
 * Create. IDs are app-generated (not Mongo ObjectIds), so we generate
 * one up front and upsert with setSingleFirestoreMongo — there's also
 * an addSingleFirestoreMongo() that generates the id internally if
 * you'd rather skip this step; this template sticks to the six
 * helpers you asked for.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: swap in real validation (e.g. a Zod schema for this
    // collection) before this reaches setSingleFirestoreMongo.
    if (!body || typeof body !== "object") {
      return fail("Invalid request body", 400);
    }

    const docId = generateFirestoreId();
    const result = await setSingleFirestoreMongo(COLLECTION, docId, body);
    if (isErrorResult(result)) return fail(result.error, 500);

    return ok({ id: result, ...body }, 201);
  } catch (err) {
    console.error(`POST /api/${COLLECTION} failed:`, err);
    return fail("Something went wrong saving data", 500);
  }
}

/**
 * ── PUT ──────────────────────────────────────────────────────────
 * Update an existing document. setSingleFirestoreMongo upserts, so
 * this is the same helper as create — the only difference is you're
 * passing an id that already exists.
 */
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return fail("Missing id", 400);

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return fail("Invalid request body", 400);
    }

    const result = await setSingleFirestoreMongo(COLLECTION, id, body);
    if (isErrorResult(result)) return fail(result.error, 500);

    return ok({ id: result, ...body });
  } catch (err) {
    console.error(`PUT /api/${COLLECTION} failed:`, err);
    return fail("Something went wrong updating data", 500);
  }
}

/**
 * ── PATCH (batch write) ────────────────────────────────────────────
 * Bulk create/update. Body shape:
 *   { docs: [{ docId, docData }, ...], persistDate?: boolean }
 * persistDate=true trusts created_at/updated_at already present on
 * each docData (e.g. a migration); omit/false lets the helper stamp
 * them itself.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.docs || !Array.isArray(body.docs)) {
      return fail("Expected a `docs` array", 400);
    }

    const result = await setBatchFirestoreMongo(COLLECTION, body.docs, body.persistDate ?? false);
    if (isErrorResult(result)) return fail(result.error, 500);

    return ok(result); // { ids: string[] }
  } catch (err) {
    console.error(`PATCH /api/${COLLECTION} failed:`, err);
    return fail("Something went wrong with the batch write", 500);
  }
}

/**
 * ── DELETE ───────────────────────────────────────────────────────
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return fail("Missing id", 400);

    const result = await deleteSingleFirestoreMongo(COLLECTION, id);
    if (isErrorResult(result)) return fail(result.error, 500);

    return ok({ id: result });
  } catch (err) {
    console.error(`DELETE /api/${COLLECTION} failed:`, err);
    return fail("Something went wrong deleting data", 500);
  }
}