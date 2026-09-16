import path from 'node:path';

import multer, { MulterError, type FileFilterCallback } from 'multer';
import type { NextFunction, Request, Response } from 'express';

import { UPLOAD } from '@/config/constants';
import { env } from '@/config/env';
import { ApiError, ErrorCode } from '@/utils/ApiError';

const MAX_FILE_BYTES = env.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;

/**
 * Magic-number prefixes. The declared MIME type and the extension are both attacker
 * controlled, so the bytes get the final say before anything is uploaded.
 */
const MAGIC_NUMBERS: Array<{ format: string; test: (buffer: Buffer) => boolean }> = [
  { format: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    format: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    format: 'webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    format: 'avif',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && b.subarray(8, 12).toString('ascii').startsWith('avi'),
  },
];

export function isRealImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return MAGIC_NUMBERS.some((entry) => entry.test(buffer));
}

function fileFilter(_req: Request, file: Express.Multer.File, callback: FileFilterCallback): void {
  const mimeAllowed = (UPLOAD.ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype);
  const extension = path.extname(file.originalname).toLowerCase();
  const extensionAllowed = (UPLOAD.ALLOWED_EXTENSIONS as readonly string[]).includes(extension);

  if (!mimeAllowed || !extensionAllowed) {
    callback(
      ApiError.badRequest(
        `Unsupported file type. Allowed: ${UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`,
        ErrorCode.INVALID_FILE_TYPE,
      ),
    );
    return;
  }

  callback(null, true);
}

/** Memory storage: buffers stream straight to Cloudinary, nothing hits the filesystem. */
const storage = multer.memoryStorage();

export const uploadSingleImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
}).single('image');

export const uploadMultipleImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: env.MAX_UPLOAD_FILES },
}).array('images', env.MAX_UPLOAD_FILES);

/** Translates Multer's own errors into the standard API error envelope. */
export function handleUploadErrors(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      next(
        ApiError.badRequest(
          `Each file must be ${env.MAX_UPLOAD_FILE_SIZE_MB}MB or smaller`,
          ErrorCode.FILE_TOO_LARGE,
        ),
      );
      return;
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      next(
        ApiError.badRequest(
          `You can upload at most ${env.MAX_UPLOAD_FILES} files at once`,
          ErrorCode.UPLOAD_FAILED,
        ),
      );
      return;
    }
    next(ApiError.badRequest(error.message, ErrorCode.UPLOAD_FAILED));
    return;
  }
  next(error);
}

/**
 * Second gate, after Multer: verifies the actual bytes are an image. A `.png` file
 * whose contents are a script gets rejected here rather than being stored and served.
 */
export function verifyImageContents(req: Request, _res: Response, next: NextFunction): void {
  const files: Express.Multer.File[] = req.files
    ? Array.isArray(req.files)
      ? req.files
      : Object.values(req.files).flat()
    : req.file
      ? [req.file]
      : [];

  for (const file of files) {
    if (!isRealImage(file.buffer)) {
      next(
        ApiError.badRequest(
          `"${file.originalname}" is not a valid image file`,
          ErrorCode.INVALID_FILE_TYPE,
        ),
      );
      return;
    }
  }

  next();
}
