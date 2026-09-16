import { Router } from 'express';

import { productController } from '@/controllers/catalog.controller';
import { optionalAuth, requireAuth, requireRole } from '@/middleware/auth';
import { uploadLimiter, writeLimiter } from '@/middleware/rateLimit';
import { handleUploadErrors, uploadMultipleImages, verifyImageContents } from '@/middleware/upload';
import { validate, validateBody, validateParams, validateQuery } from '@/middleware/validate';
import { idParamSchema, slugParamSchema } from '@/schemas/common.schema';
import {
  adminProductQuerySchema,
  createProductSchema,
  productQuerySchema,
  updateInventorySchema,
  updateProductSchema,
} from '@/schemas/product.schema';
import { z } from 'zod';

const router = Router();

// ── Public storefront ───────────────────────────────────────────────────────
router.get('/', validateQuery(productQuerySchema), productController.list);
router.get('/facets', validateQuery(productQuerySchema), productController.facets);

// ── Admin (declared before /:slug so "admin" is not read as a slug) ─────────
router.get(
  '/admin/all',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validateQuery(adminProductQuerySchema),
  productController.adminList,
);
router.get(
  '/admin/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validateParams(idParamSchema),
  productController.adminGetById,
);

router.get('/:slug', validateParams(slugParamSchema), optionalAuth, productController.getBySlug);
router.get('/:slug/related', validateParams(slugParamSchema), productController.getRelated);

// ── Writes ──────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validateBody(createProductSchema),
  productController.create,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateProductSchema }),
  productController.update,
);

// Hard delete is ADMIN-only; STAFF can archive via a status update instead.
router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateParams(idParamSchema),
  productController.remove,
);

router.post(
  '/:id/images',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  uploadLimiter,
  validateParams(idParamSchema),
  uploadMultipleImages,
  handleUploadErrors,
  verifyImageContents,
  productController.uploadImages,
);

router.delete(
  '/:id/images/:imageId',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validateParams(idParamSchema.extend({ imageId: z.string().min(1).max(64) })),
  productController.deleteImage,
);

router.patch(
  '/:id/inventory',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateInventorySchema }),
  productController.updateInventory,
);

export default router;
