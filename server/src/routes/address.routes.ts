import { Router } from 'express';

import { addressController } from '@/controllers/cart.controller';
import { requireAuth } from '@/middleware/auth';
import { validate, validateBody } from '@/middleware/validate';
import { createAddressSchema, updateAddressSchema } from '@/schemas/address.schema';
import { idParamSchema } from '@/schemas/common.schema';

const router = Router();

router.use(requireAuth);

router.get('/', addressController.list);
router.get('/:id', validate({ params: idParamSchema }), addressController.get);
router.post('/', validateBody(createAddressSchema), addressController.create);
router.patch('/:id', validate({ params: idParamSchema, body: updateAddressSchema }), addressController.update);
router.delete('/:id', validate({ params: idParamSchema }), addressController.remove);
router.patch('/:id/default', validate({ params: idParamSchema }), addressController.setDefault);

export default router;
