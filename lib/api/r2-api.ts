import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2 } from '@/lib/config/r2-config';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const BUCKET_NAME = process.env.R2_BUCKET_NAME!;

/**
 * Upload a file buffer to R2 at the given key and return its public URL.
 * `key` should NOT start with a leading slash — see path convention
 * discussion in upload-route.example.ts.
 */
export const uploadFileR2 = async (buffer: Buffer, key: string, contentType: string): Promise<string> => {
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      })
    );

    return `https://${BUCKET_NAME}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
  } catch (error) {
    throw new Error(`Failed to upload to R2: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Extract the storage key from a public URL. Works because
 * BUCKET_BASE_URL is a custom domain mapped directly onto the bucket,
 * so the URL path IS the key.
 */
export const extractKeyR2 = (url: string): string | null => {
  const key = new URL(url).pathname.substring(1);
  return key || null;
};

export const deleteFileR2 = async (url: string): Promise<void> => {
  try {
    const key = extractKeyR2(url);
    if (!key) throw new Error('Incorrect R2 URL format');

    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  } catch (error) {
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
