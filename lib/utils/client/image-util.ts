import imageCompression from 'browser-image-compression';

export type ProcessImageOptions = {
  useWebWorker?: boolean;
  maxSizeMB?: number;
  aspectRatio?: number;
  aspectRatioRange?: {
    min: number;
    max: number;
  };
  maxWidthOrHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
};

const cropImageWithAspectRatioRange = async (file: File, aspectRatioRange: { min: number; max: number }): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      const { width, height } = img;
      const currentRatio = width / height;

      let targetRatio: number;
      let cropWidth: number;
      let cropHeight: number;

      if (currentRatio < aspectRatioRange.min) targetRatio = aspectRatioRange.min;
      else if (currentRatio > aspectRatioRange.max) targetRatio = aspectRatioRange.max;
      else targetRatio = currentRatio;

      if (currentRatio > targetRatio) {
        cropHeight = height;
        cropWidth = height * targetRatio;
      } else {
        cropWidth = width;
        cropHeight = width / targetRatio;
      }

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const cropX = (width - cropWidth) / 2;
      const cropY = (height - cropHeight) / 2;

      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const croppedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(croppedFile);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        file.type,
        0.95
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

const cropImageWithAspectRatio = async (file: File, aspectRatio: number = 1): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      const { width, height } = img;

      let cropWidth: number;
      let cropHeight: number;

      const currentRatio = width / height;

      if (currentRatio > aspectRatio) {
        cropHeight = height;
        cropWidth = height * aspectRatio;
      } else {
        cropWidth = width;
        cropHeight = width / aspectRatio;
      }

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const cropX = (width - cropWidth) / 2;
      const cropY = (height - cropHeight) / 2;

      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const croppedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(croppedFile);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        file.type,
        0.95
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

export const processImage = async (file: File, options: ProcessImageOptions = {}): Promise<File> => {
  try {
    let croppedFile: File;

    if (options.aspectRatioRange) {
      croppedFile = await cropImageWithAspectRatioRange(file, options.aspectRatioRange);
    } else {
      const aspectRatio = options.aspectRatio || 1;
      croppedFile = await cropImageWithAspectRatio(file, aspectRatio);
    }

    const compressionOptions = {
      maxSizeMB: options.maxSizeMB || 1,
      maxWidthOrHeight: options.maxWidthOrHeight || Math.max(options.maxWidth || 1000, options.maxHeight || 1000),
      useWebWorker: options.useWebWorker !== false,
      fileType: file.type,
    };

    if (options.maxWidth && options.maxHeight) compressionOptions.maxWidthOrHeight = Math.min(options.maxWidth, options.maxHeight);
    else if (options.maxWidth) compressionOptions.maxWidthOrHeight = options.maxWidth;
    else if (options.maxHeight) compressionOptions.maxWidthOrHeight = options.maxHeight;

    const compressedFile = await imageCompression(croppedFile, compressionOptions);

    return compressedFile;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};
