import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { cartRepository } from '@/repositories/cart.repository';
import { buildCartView, cartSubtotal } from '@/services/cart.service';
import { couponService } from '@/services/coupon.service';
import { orderService } from '@/services/order.service';
import { paymentService } from '@/services/payment.service';
import type {
  AdminOrderQuery,
  CancelOrderInput,
  CheckoutInput,
  OrderQuery,
  ReturnOrderInput,
  UpdateOrderStatusInput,
  VerifyPaymentInput,
} from '@/schemas/order.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { asyncHandler } from '@/utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '@/utils/response';
import type { AuthenticatedRequest } from '@/types';

export const orderController = {
  checkout: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const order = await orderService.checkout(user.id, req.body as CheckoutInput);
    return sendCreated(res, { order }, 'Order placed');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { items, total, page, limit } = await orderService.listForUser(
      user.id,
      req.query as unknown as OrderQuery,
    );
    return sendSuccess(res, { orders: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const order = await orderService.getForUser(user.id, req.params.id);
    return sendSuccess(res, { order });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { reason } = req.body as CancelOrderInput;
    const order = await orderService.cancel(user.id, req.params.id, reason);
    return sendSuccess(res, { order }, { message: 'Order cancelled' });
  }),

  requestReturn: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { reason } = req.body as ReturnOrderInput;
    const order = await orderService.requestReturn(user.id, req.params.id, reason);
    return sendSuccess(res, { order }, { message: 'Return requested' });
  }),

  // ----- admin ------------------------------------------------------------

  adminList: asyncHandler(async (req: Request, res: Response) => {
    const { items, total, page, limit } = await orderService.listAdmin(
      req.query as unknown as AdminOrderQuery,
    );
    return sendSuccess(res, { orders: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  adminGet: asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.getAdmin(req.params.id);
    return sendSuccess(res, { order });
  }),

  adminUpdateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const order = await orderService.updateStatus(
      req.params.id,
      req.body as UpdateOrderStatusInput,
      user.id,
    );
    return sendSuccess(res, { order }, { message: 'Order status updated' });
  }),

  adminRefund: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const body = req.body as { amount?: number } | undefined;
    const order = await paymentService.refund(req.params.id, user.id, body?.amount);
    return sendSuccess(res, { order }, { message: 'Refund processed' });
  }),
};

export const couponCartController = {
  /**
   * Previews a coupon against the live cart. Purely informational — checkout re-runs
   * the same validation, so a stale preview can never become a real discount.
   */
  preview: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { code } = req.body as { code: string };

    const cart = await cartRepository.findOrCreateByUserId(user.id);
    if (cart.items.length === 0) {
      throw ApiError.badRequest('Your cart is empty', ErrorCode.CART_EMPTY);
    }

    // Same subtotal the cart screen and checkout are built from, so a preview can never
    // quote a discount against a different basket than the one being bought.
    const subtotal = cartSubtotal(cart.items);
    const coupon = await couponService.preview(code, user.id, subtotal);
    const view = buildCartView(cart, new Prisma.Decimal(coupon.discountAmount), coupon.code);

    return sendSuccess(res, { coupon, cart: view }, { message: 'Coupon applied' });
  }),
};

export const paymentController = {
  config: asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, paymentService.getPublicConfig());
  }),

  createOrder: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { orderId } = req.body as { orderId: string };
    const payment = await paymentService.createPaymentOrder(user.id, orderId);
    return sendCreated(res, payment);
  }),

  verify: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const order = await paymentService.verifyPayment(user.id, req.body as VerifyPaymentInput);
    return sendSuccess(res, { order }, { message: 'Payment verified' });
  }),

  /**
   * Webhooks always answer 200 once the signature checks out, even for events we do not
   * act on — a non-2xx makes Razorpay retry indefinitely.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') {
      throw ApiError.unauthorized('Missing webhook signature', ErrorCode.PAYMENT_SIGNATURE_INVALID);
    }

    // The raw buffer is captured by the express.json `verify` hook in app.ts.
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    const result = await paymentService.handleWebhook(rawBody, signature);

    return sendSuccess(res, result);
  }),
};
