import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { convertToWebP } from '@/lib/utils/server/image-util';

export type VideoMetadata = {
  type: 'video';
  size: number;
  ar: number;
  width: number;
  height: number;
  duration: number;
};

export const getVideoMetadata = async (buffer: Buffer): Promise<VideoMetadata> => {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);

  try {
    await fs.promises.writeFile(tempFilePath, buffer);

    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(tempFilePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });

    const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
    if (!videoStream) {
      throw new Error('No video stream found');
    }

    const width = parseInt(videoStream.width);
    const height = parseInt(videoStream.height);
    const duration = parseFloat(metadata.format.duration);
    const size = parseInt(metadata.format.size);
    const ar = width && height ? Math.round((width / height) * 100) / 100 : 0;

    return { type: 'video', size, ar, width, height, duration };
  } finally {
    try {
      await fs.promises.unlink(tempFilePath);
    } catch (err) {
      console.warn('Failed to delete temporary file:', err);
    }
  }
};

export const createVideoThumbnail = async (buffer: Buffer): Promise<Buffer> => {
  const tempDir = os.tmpdir();
  const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
  const tempThumbnailPath = path.join(tempDir, `temp_thumbnail_${Date.now()}.png`);

  try {
    await fs.promises.writeFile(tempVideoPath, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .seekInput(0)
        .frames(1)
        .output(tempThumbnailPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const pngBuffer = await fs.promises.readFile(tempThumbnailPath);
    const webpBuffer = await convertToWebP(pngBuffer);

    return webpBuffer;
  } finally {
    try {
      if (fs.existsSync(tempVideoPath)) {
        await fs.promises.unlink(tempVideoPath);
      }
      if (fs.existsSync(tempThumbnailPath)) {
        await fs.promises.unlink(tempThumbnailPath);
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }
};

const getCropFilter = (position: string, width: number, height: number): string => {
  const positionMap: Record<string, string> = {
    center: `crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2`,
    top: `crop=${width}:${height}:(iw-${width})/2:0`,
    'right top': `crop=${width}:${height}:iw-${width}:0`,
    right: `crop=${width}:${height}:iw-${width}:(ih-${height})/2`,
    'right bottom': `crop=${width}:${height}:iw-${width}:ih-${height}`,
    bottom: `crop=${width}:${height}:(iw-${width})/2:ih-${height}`,
    'left bottom': `crop=${width}:${height}:0:ih-${height}`,
    left: `crop=${width}:${height}:0:(ih-${height})/2`,
    'left top': `crop=${width}:${height}:0:0`,
  };

  return positionMap[position] || positionMap['center'];
};

type ConvertToVideoOptions = {
  quality?: number;
  maxHeight?: number;
  maxWidth?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: 'center' | 'top' | 'right top' | 'right' | 'right bottom' | 'bottom' | 'left bottom' | 'left' | 'left top';
  duration?: number;
};

export const convertToWebM = async (buffer: Buffer, options: ConvertToVideoOptions = {}): Promise<Buffer> => {
  const { quality = 100, maxHeight, maxWidth, fit = 'cover', position = 'center', duration } = options;

  const tempDir = os.tmpdir();
  const tempInputPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp4`);
  const tempOutputPath = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webm`);

  try {
    await fs.promises.writeFile(tempInputPath, buffer);
  } catch (error) {
    throw new Error(`Failed to write input file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(tempInputPath)
      .videoCodec('libvpx-vp9')
      .audioCodec('libopus')
      .format('webm')
      .outputOptions(['-deadline realtime', '-cpu-used 4', '-avoid_negative_ts make_zero', '-fflags +genpts']);

    if (quality !== 100) {
      const crf = Math.round(63 - (quality / 100) * 63);
      command.outputOptions([`-crf ${crf}`]);
    }

    if (duration) {
      command.duration(duration);
    }

    if (maxWidth || maxHeight) {
      let scaleFilter = '';

      if (maxWidth && maxHeight) {
        switch (fit) {
          case 'cover':
            scaleFilter = `scale='if(gte(iw/ih,${maxWidth}/${maxHeight}),${maxWidth},-1)':'if(gte(iw/ih,${maxWidth}/${maxHeight}),-1,${maxHeight})'`;
            break;
          case 'contain':
            scaleFilter = `scale='if(gte(iw/ih,${maxWidth}/${maxHeight}),-1,${maxHeight})':'if(gte(iw/ih,${maxWidth}/${maxHeight}),${maxWidth},-1)'`;
            break;
          case 'fill':
            scaleFilter = `scale=${maxWidth}:${maxHeight}`;
            break;
          case 'inside':
            scaleFilter = `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`;
            break;
          case 'outside':
            scaleFilter = `scale='max(${maxWidth},iw)':'max(${maxHeight},ih)':force_original_aspect_ratio=increase`;
            break;
        }
      } else if (maxWidth) {
        scaleFilter = `scale=${maxWidth}:-1`;
      } else if (maxHeight) {
        scaleFilter = `scale=-1:${maxHeight}`;
      }

      if (scaleFilter) {
        command.videoFilters(scaleFilter);
      }

      if ((fit === 'cover' || fit === 'outside') && maxWidth && maxHeight) {
        const cropFilter = getCropFilter(position, maxWidth, maxHeight);
        if (cropFilter) {
          command.videoFilters([scaleFilter, cropFilter]);
        }
      }
    }

    command
      .on('error', async (error) => {
        await Promise.all([fs.promises.unlink(tempInputPath).catch(() => {}), fs.promises.unlink(tempOutputPath).catch(() => {})]);
        reject(new Error(`FFmpeg error: ${error.message}`));
      })
      .on('end', async () => {
        try {
          const resultBuffer = await fs.promises.readFile(tempOutputPath);
          await Promise.all([fs.promises.unlink(tempInputPath).catch(() => {}), fs.promises.unlink(tempOutputPath).catch(() => {})]);

          resolve(resultBuffer);
        } catch (error) {
          await Promise.all([fs.promises.unlink(tempInputPath).catch(() => {}), fs.promises.unlink(tempOutputPath).catch(() => {})]);
          reject(new Error(`Failed to read output file: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      })
      .save(tempOutputPath);
  });
};

export const convertToMP4 = async (buffer: Buffer, options: ConvertToVideoOptions = {}): Promise<Buffer> => {
  const { quality = 100, maxHeight, maxWidth, fit = 'cover', position = 'center', duration } = options;

  const tempDir = os.tmpdir();
  const tempInputPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.mp4`);
  const tempOutputPath = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.mp4`);

  try {
    await fs.promises.writeFile(tempInputPath, buffer);
  } catch (error) {
    throw new Error(`Failed to write input file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(tempInputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions(['-preset fast', '-movflags +faststart', '-pix_fmt yuv420p']);

    if (quality !== 100) {
      const crf = Math.round(51 - (quality / 100) * 33); // Maps 100% quality to CRF 18, 0% to CRF 51
      command.outputOptions([`-crf ${crf}`]);
    }

    if (duration) {
      command.duration(duration);
    }

    if (maxWidth || maxHeight) {
      let scaleFilter = '';

      if (maxWidth && maxHeight) {
        switch (fit) {
          case 'cover':
            scaleFilter = `scale='if(gte(iw/ih,${maxWidth}/${maxHeight}),${maxWidth},-1)':'if(gte(iw/ih,${maxWidth}/${maxHeight}),-1,${maxHeight})'`;
            break;
          case 'contain':
            scaleFilter = `scale='if(gte(iw/ih,${maxWidth}/${maxHeight}),-1,${maxHeight})':'if(gte(iw/ih,${maxWidth}/${maxHeight}),${maxWidth},-1)'`;
            break;
          case 'fill':
            scaleFilter = `scale=${maxWidth}:${maxHeight}`;
            break;
          case 'inside':
            scaleFilter = `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`;
            break;
          case 'outside':
            scaleFilter = `scale='max(${maxWidth},iw)':'max(${maxHeight},ih)':force_original_aspect_ratio=increase`;
            break;
        }
      } else if (maxWidth) {
        scaleFilter = `scale=${maxWidth}:-1`;
      } else if (maxHeight) {
        scaleFilter = `scale=-1:${maxHeight}`;
      }

      if (scaleFilter) {
        command.videoFilters(scaleFilter);
      }

      if ((fit === 'cover' || fit === 'outside') && maxWidth && maxHeight) {
        const cropFilter = getCropFilter(position, maxWidth, maxHeight);
        if (cropFilter) {
          command.videoFilters([scaleFilter, cropFilter]);
        }
      }
    }

    command
      .on('error', async (error) => {
        // Cleanup temp files on error
        await Promise.all([fs.promises.unlink(tempInputPath).catch(() => {}), fs.promises.unlink(tempOutputPath).catch(() => {})]);
        reject(new Error(`FFmpeg error: ${error.message}`));
      })
      .on('end', async () => {
        try {
          const resultBuffer = await fs.promises.readFile(tempOutputPath);
          await Promise.all([fs.promises.unlink(tempInputPath).catch(() => {}), fs.promises.unlink(tempOutputPath).catch(() => {})]);

          resolve(resultBuffer);
        } catch (error) {
          await Promise.all([fs.promises.unlink(tempInputPath).catch(() => {}), fs.promises.unlink(tempOutputPath).catch(() => {})]);
          reject(new Error(`Failed to read output file: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      })
      .save(tempOutputPath);
  });
};
