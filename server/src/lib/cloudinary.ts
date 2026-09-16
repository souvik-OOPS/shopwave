import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

import { env, isCloudinaryConfigured } from '@/config/env';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { logger } from '@/lib/logger';

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export type UploadFolder = 'products' | 'categories' | 'brands' | 'avatars' | 'reviews';

/**
 * Uploads a buffer straight to Cloudinary — files never touch local disk, which keeps
 * the container stateless and removes a whole class of path-traversal problems.
 */
export async function uploadImage(
  buffer: Buffer,
  folder: UploadFolder,
  options: { filename?: string } = {},
): Promise<UploadedImage> {
  if (!isCloudinaryConfigured) {
    throw ApiError.serviceUnavailable('Image uploads are not configured', ErrorCode.UPLOAD_FAILED);
  }

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
        resource_type: 'image',
        // Re-encode server-side: strips EXIF and any payload smuggled in a valid image.
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        ...(options.filename ? { public_id: options.filename } : {}),
      },
      (error, uploadResult) => {
        if (error) return reject(new Error(error.message));
        if (!uploadResult) return reject(new Error('Cloudinary returned an empty response'));
        return resolve(uploadResult);
      },
    );
    stream.end(buffer);
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}

export async function uploadImages(buffers: Buffer[], folder: UploadFolder): Promise<UploadedImage[]> {
  return Promise.all(buffers.map((buffer) => uploadImage(buffer, folder)));
}

/** Best-effort: a failed cleanup must never fail the user-facing request. */
export async function deleteImage(publicId: string): Promise<void> {
  if (!isCloudinaryConfigured || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.warn({ err: error, publicId }, 'Failed to delete Cloudinary asset');
  }
}

export async function deleteImages(publicIds: string[]): Promise<void> {
  await Promise.all(publicIds.filter(Boolean).map(deleteImage));
}

export { cloudinary };
