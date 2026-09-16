import { Router } from 'express';

import { brandController } from '@/controllers/catalog.controller';
import { requireAuth, requireRole } from '@/middleware/auth';
import { writeLimiter } from '@/middleware/rateLimit';
import { validate, validateBody, validateParams, validateQuery } from '@/middleware/validate';
import { brandQuerySchema, createBrandSchema, updateBrandSchema } from '@/schemas/brand.schema';
import { idParamSchema, slugParamSchema } from '@/schemas/common.schema';

const router = Router();

router.get('/', validateQuery(brandQuerySchema), brandController.list);
router.get('/:slug', validateParams(slugParamSchema), brandController.getBySlug);

router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validateBody(createBrandSchema),
  brandController.create,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateBrandSchema }),
  brandController.update,
);

router.delete('/:id', requireAuth, requireRole('ADMIN'), validateParams(idParamSchema), brandController.remove);

export default router;
