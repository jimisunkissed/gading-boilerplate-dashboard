import sharp from 'sharp';

export type ImageMetadata = {
  type: 'image';
  size: number;
  ar: number;
  width: number;
  height: number;
};

export const getImageMetadata = async (buffer: Buffer): Promise<ImageMetadata> => {
  const metadata = await sharp(buffer).metadata();
  const { width = 0, height = 0 } = metadata;
  const ar = width && height ? Math.round((width / height) * 100) / 100 : 0;

  return { type: 'image', size: buffer.length, ar, width, height };
};

type ConvertToWebPOptions = {
  quality?: number;
  maxHeight?: number;
  maxWidth?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: 'center' | 'top' | 'right top' | 'right' | 'right bottom' | 'bottom' | 'left bottom' | 'left' | 'left top';
};

export const convertToWebP = async (buffer: Buffer, options: ConvertToWebPOptions = {}): Promise<Buffer> => {
  const { quality = 100, maxWidth, maxHeight, fit = 'cover', position = 'center' } = options;

  let sharpInstance = sharp(buffer);
  if (maxWidth || maxHeight) {
    sharpInstance = sharpInstance.resize(maxWidth, maxHeight, { fit, position });
  }
  const webp = await sharpInstance.webp({ quality }).toBuffer();

  return webp;
};
