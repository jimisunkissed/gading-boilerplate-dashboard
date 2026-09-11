export const getFileFormat = (buffer: Buffer): string => {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buffer.subarray(0, 3).toString() === 'GIF') return 'gif';

  if (buffer.subarray(4, 8).toString() === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString();
    if (brand.includes('mp4') || brand.includes('isom') || brand.includes('avc1')) {
      return 'mp4';
    }
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'AVI ') return 'avi';
  if (buffer.subarray(4, 8).toString() === 'moov' || buffer.subarray(4, 8).toString() === 'mdat') return 'mov';

  return 'bin';
};

export const getMimeType = (format: string): string => {
  const mimeTypes: { [key: string]: string } = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
  };

  return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
};
