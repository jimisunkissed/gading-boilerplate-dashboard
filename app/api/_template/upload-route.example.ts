import { NextRequest, NextResponse } from 'next/server';
import { uploadFileR2 } from '@/lib/api/r2-api';
import { setSingleFirestoreMongo } from '@/lib/api/firebase-mongo-api';
import { generateFirestoreId } from '@/lib/utils/server/firebase-mongo-util';

const COLLECTION = 'media'; // replace with the collection this upload attaches to

/**
 * ── RESPONSE ENVELOPE ─────────────────────────────────────────────
 * Same convention as crud-route.example.ts. Keep ok()/fail() as-is.
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
 * Only firebase-mongo-api helpers return `{ error }` instead of
 * throwing. r2-api helpers (uploadFileR2, etc.) throw directly — the
 * outer try/catch below is what catches those. This guard is only
 * needed for the Mongo call at the end of this route.
 */
function isErrorResult(value: unknown): value is { error: string } {
  return !!value && typeof value === 'object' && 'error' in value;
}

/**
 * ── POST (multipart/form-data) ─────────────────────────────────────
 * Pattern:
 *   1. Parse the incoming FormData
 *   2. Generate ONE id, used as both the R2 filename and the Mongo
 *      document id — guarantees no filename collision (unlike a raw
 *      timestamp) and means the file and its DB record are always
 *      cross-referenceable by id
 *   3. Upload to R2 under a stable, developer-chosen folder (never a
 *      user-supplied path segment like a username — see note below)
 *   4. Save the resulting url to Mongo
 *
 * Client-side call looks like:
 *
 *   const formData = new FormData();
 *   formData.append("file", fileInput.files[0]);
 *   formData.append("label", "menu-photo"); // any extra fields you need
 *   fetch("/api/media/upload", { method: "POST", body: formData });
 *
 * Do NOT set a Content-Type header manually — the browser sets the
 * multipart boundary for you automatically.
 *
 * Want per-user folders instead of a flat collection folder? Use a
 * stable id (e.g. the Clerk user id), never a display name/username —
 * those can collide, change, or contain characters that need
 * sanitizing before they're safe in a URL path:
 *
 *   const key = `users/${clerkUserId}/${id}.${extension}`;
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return fail('No file provided', 400);
    }

    // Basic guardrail — adjust to what your dashboard needs.
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE_BYTES) {
      return fail('File too large (max 5MB)', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const id = generateFirestoreId();
    const extension = file.name.split('.').pop() || 'bin';
    const key = `${COLLECTION}/${id}.${extension}`; // e.g. media/aBc123XyZ.jpg

    // Throws on failure — caught by the outer try/catch below.
    const url = await uploadFileR2(buffer, key, file.type);

    const label = formData.get('label')?.toString() ?? null;

    const result = await setSingleFirestoreMongo(COLLECTION, id, { url, label });
    if (isErrorResult(result)) return fail(result.error, 500);

    return ok({ id: result, url, label }, 201);
  } catch (err) {
    console.error(`POST /api/${COLLECTION}/upload failed:`, err);
    return fail('Something went wrong uploading the file', 500);
  }
}
