import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export type ProcessVideoOptions = {
  maxSizeMB?: number;
  aspectRatio?: number;
  maxWidthOrHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  maxDuration?: number;
  preserveAudio?: boolean;
};

type VideoThumbnailOptions = {
  seekTo?: number;
  aspectRatio?: number;
};

let ffmpeg: FFmpeg | null = null;

const initializeFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

export const createVideoThumbnail = async (file: File, options: VideoThumbnailOptions = {}): Promise<string> => {
  const { seekTo = 0.0, aspectRatio = 4 / 3 } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    video.addEventListener('loadedmetadata', () => {
      const videoAspectRatio = video.videoWidth / video.videoHeight;

      let canvasWidth: number;
      let canvasHeight: number;

      if (videoAspectRatio > aspectRatio) {
        canvasHeight = video.videoHeight;
        canvasWidth = canvasHeight * aspectRatio;
      } else {
        canvasWidth = video.videoWidth;
        canvasHeight = canvasWidth / aspectRatio;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      video.currentTime = video.duration * seekTo;
    });

    video.addEventListener('seeked', () => {
      const videoAspectRatio = video.videoWidth / video.videoHeight;

      let sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number;

      if (videoAspectRatio > aspectRatio) {
        sourceHeight = video.videoHeight;
        sourceWidth = sourceHeight * aspectRatio;
        sourceX = (video.videoWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        sourceWidth = video.videoWidth;
        sourceHeight = sourceWidth / aspectRatio;
        sourceX = 0;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }

      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('Failed to generate thumbnail'));
        }
      });
    });

    video.addEventListener('error', (e) => {
      reject(new Error(`Video loading failed: ${e.message || 'Unknown error'}`));
    });

    video.src = URL.createObjectURL(file);
    video.load();
  });
};

export type VideoMetadata = {
  type: 'video';
  size: number;
  ar: number;
  width: number;
  height: number;
  duration: number;
};

export const getVideoMetadata = async (videoFile: File): Promise<VideoMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoFile);

    video.onloadedmetadata = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const duration = video.duration;
        const size = videoFile.size;
        const ar = width && height ? Math.round((width / height) * 100) / 100 : 0;

        URL.revokeObjectURL(url);

        resolve({
          type: 'video',
          size,
          ar,
          width,
          height,
          duration,
        });
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to extract video metadata'));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = url;
    video.preload = 'metadata';
  });
};

const calculateDimensions = (originalWidth: number, originalHeight: number, options: ProcessVideoOptions) => {
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (options.aspectRatio) {
    const currentRatio = originalWidth / originalHeight;
    if (currentRatio > options.aspectRatio) {
      targetWidth = Math.round(originalHeight * options.aspectRatio);
    } else if (currentRatio < options.aspectRatio) {
      targetHeight = Math.round(originalWidth / options.aspectRatio);
    }
  }

  if (options.maxWidth && targetWidth > options.maxWidth) {
    const scale = options.maxWidth / targetWidth;
    targetWidth = options.maxWidth;
    targetHeight = Math.round(targetHeight * scale);
  }

  if (options.maxHeight && targetHeight > options.maxHeight) {
    const scale = options.maxHeight / targetHeight;
    targetHeight = options.maxHeight;
    targetWidth = Math.round(targetWidth * scale);
  }

  if (options.maxWidthOrHeight) {
    const maxDimension = Math.max(targetWidth, targetHeight);
    if (maxDimension > options.maxWidthOrHeight) {
      const scale = options.maxWidthOrHeight / maxDimension;
      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }
  }

  targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

  return { targetWidth, targetHeight };
};

const buildFilterChain = (
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
  options: ProcessVideoOptions
): string => {
  const filters: string[] = [];

  if (options.aspectRatio) {
    const currentRatio = originalWidth / originalHeight;
    if (Math.abs(currentRatio - options.aspectRatio) > 0.01) {
      let cropWidth = originalWidth;
      let cropHeight = originalHeight;

      if (currentRatio > options.aspectRatio) {
        cropWidth = Math.round(originalHeight * options.aspectRatio);
      } else {
        cropHeight = Math.round(originalWidth / options.aspectRatio);
      }

      const cropX = Math.round((originalWidth - cropWidth) / 2);
      const cropY = Math.round((originalHeight - cropHeight) / 2);

      filters.push(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`);
    }
  }

  if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
    filters.push(`scale=${targetWidth}:${targetHeight}`);
  }

  return filters.length > 0 ? filters.join(',') : '';
};

export const processVideo = async (videoFile: File, options: ProcessVideoOptions = {}): Promise<Blob> => {
  const ffmpegInstance = await initializeFFmpeg();

  const timestamp = Date.now();
  const inputFileName = `input_${timestamp}.mp4`;
  const outputFileName = `output_${timestamp}.mp4`;

  try {
    const { width: originalWidth, height: originalHeight } = await getVideoMetadata(videoFile);

    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoFile));
    const command: string[] = ['-i', inputFileName];

    const { targetWidth, targetHeight } = calculateDimensions(originalWidth, originalHeight, options);
    const videoFilters = buildFilterChain(originalWidth, originalHeight, targetWidth, targetHeight, options);

    if (videoFilters) {
      command.push('-vf', videoFilters);
    }

    command.push('-c:v', 'libx264');
    command.push('-preset', 'veryfast');
    command.push('-threads', '8');
    command.push('-crf', '23');

    if (options.videoBitrate) command.push('-b:v', `${options.videoBitrate}k`);
    if (options.preserveAudio !== false) {
      command.push('-c:a', 'aac');
      if (options.audioBitrate) command.push('-b:a', `${options.audioBitrate}k`);
      else command.push('-b:a', '128k');
    } else {
      command.push('-an');
    }
    if (options.maxDuration) command.push('-t', options.maxDuration.toString());

    command.push('-f', 'mp4');
    command.push('-movflags', '+faststart');
    command.push(outputFileName);

    await ffmpegInstance.exec(command);

    const outputData = await ffmpegInstance.readFile(outputFileName);
    let outputBlob = new Blob([outputData as BlobPart], { type: 'video/mp4' });

    if (options.maxSizeMB) {
      const maxSizeBytes = options.maxSizeMB * 1024 * 1024;

      if (outputBlob.size > maxSizeBytes) {
        const videoDuration = (await getVideoMetadata(videoFile)).duration;
        const targetBitrate = Math.floor((maxSizeBytes * 8) / (videoDuration * 1024)) - 128;

        const newCommand = ['-i', inputFileName];

        if (videoFilters) {
          newCommand.push('-vf', videoFilters);
        }

        newCommand.push('-c:v', 'libx264');
        newCommand.push('-preset', 'veryfast');
        newCommand.push('-threads', '8');
        newCommand.push('-b:v', `${Math.max(targetBitrate, 200)}k`);
        newCommand.push('-maxrate', `${Math.max(targetBitrate * 1.2, 240)}k`);
        newCommand.push('-bufsize', `${Math.max(targetBitrate * 2, 400)}k`);

        if (options.preserveAudio !== false) {
          newCommand.push('-c:a', 'aac');
          newCommand.push('-b:a', '128k');
        } else {
          newCommand.push('-an');
        }

        if (options.maxDuration) {
          newCommand.push('-t', options.maxDuration.toString());
        }

        newCommand.push('-f', 'mp4');
        newCommand.push('-movflags', '+faststart');
        newCommand.push(outputFileName);

        await ffmpegInstance.exec(newCommand);
        const newOutputData = await ffmpegInstance.readFile(outputFileName);
        outputBlob = new Blob([newOutputData as BlobPart], { type: 'video/mp4' });
      }
    }

    return outputBlob;
  } catch (error) {
    console.error('Video processing error:', error);
    throw new Error(`Failed to process video: ${error}`);
  } finally {
    try {
      await ffmpegInstance.deleteFile(inputFileName);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
    }

    try {
      await ffmpegInstance.deleteFile(outputFileName);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
    }
  }
};
