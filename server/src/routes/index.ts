import { Router } from 'express';

import addressRoutes from '@/routes/address.routes';
import adminRoutes from '@/routes/admin.routes';
import authRoutes from '@/routes/auth.routes';
import brandRoutes from '@/routes/brand.routes';
import cartRoutes from '@/routes/cart.routes';
import categoryRoutes from '@/routes/category.routes';
import couponRoutes from '@/routes/coupon.routes';
import orderRoutes, { checkoutRouter } from '@/routes/order.routes';
import paymentRoutes from '@/routes/payment.routes';
import productRoutes from '@/routes/product.routes';
import reviewRoutes from '@/routes/review.routes';
import wishlistRoutes from '@/routes/wishlist.routes';

const router = Router();

// Catalog (public reads, staff writes)
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/brands', brandRoutes);
router.use('/reviews', reviewRoutes);

// Identity
router.use('/auth', authRoutes);

// Customer-owned resources
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/addresses', addressRoutes);
router.use('/orders', orderRoutes);
router.use('/checkout', checkoutRouter);
router.use('/coupons', couponRoutes);

// Payments (includes the unauthenticated, signature-verified webhook)
router.use('/payments', paymentRoutes);

// Back office
router.use('/admin', adminRoutes);

export default router;
