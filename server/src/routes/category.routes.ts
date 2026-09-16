import { Router } from 'express';

import { categoryController } from '@/controllers/catalog.controller';
import { requireAuth, requireRole } from '@/middleware/auth';
import { writeLimiter } from '@/middleware/rateLimit';
import { validate, validateBody, validateParams, validateQuery } from '@/middleware/validate';
import {
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '@/schemas/category.schema';
import { idParamSchema, slugParamSchema } from '@/schemas/common.schema';

const router = Router();

router.get('/', validateQuery(categoryQuerySchema), categoryController.list);
router.get('/:slug', validateParams(slugParamSchema), categoryController.getBySlug);

router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validateBody(createCategorySchema),
  categoryController.create,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateCategorySchema }),
  categoryController.update,
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateParams(idParamSchema),
  categoryController.remove,
);

export default router;
