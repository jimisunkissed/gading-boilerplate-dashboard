export const getFileExtension = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    const filename = pathname.split('/').pop();
    if (!filename) return null;

    const parts = filename.split('.');
    if (parts.length < 2) return null;

    return parts.pop()?.toLowerCase() || null;
  } catch (error) {
    const lastPart = url.split('/').pop();
    if (!lastPart) return null;

    const withoutQuery = lastPart.split('?')[0].split('#')[0];
    const parts = withoutQuery.split('.');

    if (parts.length < 2) return null;
    return parts.pop()?.toLowerCase() || null;
  }
};

export const getMediaType = (url: string): 'image' | 'video' | 'unknown' => {
  const extension = getFileExtension(url);

  if (!extension) return 'unknown';

  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v', 'flv', 'wmv'];
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico'];

  if (videoExtensions.includes(extension)) return 'video';
  if (imageExtensions.includes(extension)) return 'image';

  return 'unknown';
};

export const createBufferFromUrl = async (
  url: string
): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
}> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = Date.now().toString();
  const mediaType = getMediaType(url);

  let mimeType: string;
  switch (mediaType) {
    case 'image':
      mimeType = response.headers.get('content-type') || 'image/jpeg';
      break;
    case 'video':
      mimeType = response.headers.get('content-type') || 'video/mp4';
      break;
    default:
      mimeType = response.headers.get('content-type') || 'application/octet-stream';
      break;
  }

  return { buffer, filename, mimeType };
};
