import { Prisma } from '@prisma/client';

import { PRICING } from '@/config/constants';
import { env, isRazorpayConfigured } from '@/config/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  createRazorpayOrder,
  refundRazorpayPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '@/lib/razorpay';
import { orderRepository } from '@/repositories/order.repository';
import { orderService } from '@/services/order.service';
import type { VerifyPaymentInput } from '@/schemas/order.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { fromSubunits, toSubunits } from '@/utils/money';

/**
 * Payment state is derived exclusively from cryptographically verified Razorpay data.
 *
 * Two independent paths reach "paid", and both check a signature:
 *   • `verify`  — the browser posts back what checkout.js gave it. Convenient, fast,
 *                 and completely untrusted until the HMAC matches.
 *   • `webhook` — Razorpay calls us server-to-server. Authoritative, and the only path
 *                 that still works if the customer closes the tab mid-payment.
 *
 * Both funnel into `orderService.markPaidAndConfirm`, which is idempotent, so whichever
 * arrives second is a harmless no-op.
 */

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        method?: string;
        status?: string;
        error_code?: string;
        error_description?: string;
      };
    };
  };
}

export const paymentService = {
  /**
   * Creates the gateway order. The amount comes from the stored order total — the client
   * sends only an order id, so it cannot ask to be charged ₹1 for a ₹10,000 basket.
   */
  async createPaymentOrder(userId: string, orderId: string) {
    const order = await orderRepository.findOwned(orderId, userId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);

    if (order.paymentStatus === 'PAID') {
      throw ApiError.conflict('This order has already been paid', ErrorCode.ORDER_ALREADY_PAID);
    }
    if (order.status === 'CANCELLED') {
      throw ApiError.conflict('This order was cancelled', ErrorCode.ORDER_NOT_CANCELLABLE);
    }

    // Reuse an outstanding gateway order rather than minting a duplicate on a retry.
    const pending = order.payments.find(
      (payment) => payment.status === 'PENDING' && payment.razorpayOrderId !== null,
    );
    if (pending?.razorpayOrderId) {
      return {
        razorpayOrderId: pending.razorpayOrderId,
        amount: toSubunits(order.total),
        currency: order.currency,
        orderNumber: order.orderNumber,
      };
    }

    const amountInSubunits = toSubunits(order.total);

    const razorpayOrder = await createRazorpayOrder({
      amountInSubunits,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'RAZORPAY',
        status: 'PENDING',
        razorpayOrderId: razorpayOrder.id,
        amount: order.total,
        currency: order.currency,
      },
    });

    return {
      razorpayOrderId: razorpayOrder.id,
      amount: amountInSubunits,
      currency: order.currency,
      orderNumber: order.orderNumber,
    };
  },

  /**
   * Browser handshake. A forged or replayed signature marks the payment FAILED and
   * throws — there is no code path from "client says paid" to a PAID order.
   */
  async verifyPayment(userId: string, input: VerifyPaymentInput) {
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: input.razorpay_order_id },
      include: { order: true },
    });

    if (!payment) throw ApiError.notFound('Payment record not found', ErrorCode.PAYMENT_NOT_FOUND);

    if (payment.order.userId !== userId) {
      // Do not confirm that someone else's payment id exists.
      throw ApiError.notFound('Payment record not found', ErrorCode.PAYMENT_NOT_FOUND);
    }

    const signatureValid = verifyPaymentSignature({
      razorpayOrderId: input.razorpay_order_id,
      razorpayPaymentId: input.razorpay_payment_id,
      signature: input.razorpay_signature,
    });

    if (!signatureValid) {
      // Only an outstanding payment can be marked failed. Rejecting a forged handshake
      // must not rewrite a payment the gateway already captured — that stored state is
      // what a later refund is issued against.
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          errorCode: 'SIGNATURE_MISMATCH',
          errorDescription: 'Payment signature verification failed',
        },
      });

      logger.error(
        { orderId: payment.orderId, razorpayOrderId: input.razorpay_order_id },
        'Payment signature verification failed',
      );

      throw ApiError.badRequest(
        'Payment verification failed. If money was deducted it will be refunded automatically.',
        ErrorCode.PAYMENT_SIGNATURE_INVALID,
      );
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        razorpayPaymentId: input.razorpay_payment_id,
        razorpaySignature: input.razorpay_signature,
        capturedAt: new Date(),
      },
    });

    await orderService.markPaidAndConfirm(payment.orderId);

    return orderService.getForUser(userId, payment.orderId);
  },

  /**
   * Server-to-server callback. `rawBody` must be the exact bytes Razorpay sent — a
   * re-serialised JSON object would produce a different HMAC and fail verification.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<{ handled: boolean; event?: string }> {
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Rejected webhook with an invalid signature');
      throw ApiError.unauthorized('Invalid webhook signature', ErrorCode.PAYMENT_SIGNATURE_INVALID);
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString()) as RazorpayWebhookPayload;
    } catch {
      throw ApiError.badRequest('Malformed webhook payload');
    }

    const entity = payload.payload?.payment?.entity;
    const razorpayOrderId = entity?.order_id;

    if (!razorpayOrderId) {
      // Acknowledge events we do not model, otherwise Razorpay retries them forever.
      logger.info({ event: payload.event }, 'Webhook ignored (no order reference)');
      return { handled: false, event: payload.event };
    }

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) {
      logger.warn({ razorpayOrderId, event: payload.event }, 'Webhook for an unknown payment');
      return { handled: false, event: payload.event };
    }

    switch (payload.event) {
      case 'payment.captured':
      case 'order.paid': {
        // Guard against an amount mismatch: only ever settle the amount we billed.
        if (entity?.amount !== undefined) {
          const paidAmount = fromSubunits(entity.amount);
          if (!paidAmount.equals(payment.amount)) {
            logger.error(
              { orderId: payment.orderId, expected: payment.amount.toString(), received: paidAmount.toString() },
              'Webhook amount mismatch — not confirming order',
            );
            return { handled: false, event: payload.event };
          }
        }

        // An amount is only meaningful next to its currency: 141600 is ₹1,416 or
        // $1,416 depending on this field, so a mismatch is as disqualifying as a
        // wrong amount.
        if (entity?.currency !== undefined && entity.currency !== payment.currency) {
          logger.error(
            { orderId: payment.orderId, expected: payment.currency, received: entity.currency },
            'Webhook currency mismatch — not confirming order',
          );
          return { handled: false, event: payload.event };
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            capturedAt: new Date(),
            ...(entity?.id ? { razorpayPaymentId: entity.id } : {}),
            ...(entity?.method ? { method: entity.method } : {}),
            rawPayload: payload as unknown as Prisma.InputJsonValue,
          },
        });

        await orderService.markPaidAndConfirm(payment.orderId);
        return { handled: true, event: payload.event };
      }

      case 'payment.failed': {
        // Events are not guaranteed to arrive in order, and a failure for one attempt
        // can land after a later attempt succeeded. A captured payment therefore stands:
        // recording the failure must never cancel an order the customer has paid for.
        if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
          logger.warn(
            { orderId: payment.orderId, paymentStatus: payment.status },
            'Ignoring a failure event for a payment that was already settled',
          );
          return { handled: true, event: payload.event };
        }

        const marked = await prisma.payment.updateMany({
          where: { id: payment.id, status: { notIn: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
          data: {
            status: 'FAILED',
            ...(entity?.id ? { razorpayPaymentId: entity.id } : {}),
            ...(entity?.error_code ? { errorCode: entity.error_code } : {}),
            ...(entity?.error_description ? { errorDescription: entity.error_description } : {}),
            rawPayload: payload as unknown as Prisma.InputJsonValue,
          },
        });

        if (marked.count === 0) return { handled: true, event: payload.event };

        // Same guard one level up: the order may have been confirmed by the browser
        // handshake while this event was in flight.
        await prisma.order.updateMany({
          where: { id: payment.orderId, paymentStatus: { not: 'PAID' } },
          data: { paymentStatus: 'FAILED' },
        });

        // Free the reserved stock so an abandoned payment does not block real buyers.
        await orderService.releaseFailedOrder(
          payment.orderId,
          entity?.error_description ?? 'Payment failed',
        );

        return { handled: true, event: payload.event };
      }

      case 'refund.processed': {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED', rawPayload: payload as unknown as Prisma.InputJsonValue },
        });
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'REFUNDED', status: 'REFUNDED', refundedAt: new Date() },
        });
        return { handled: true, event: payload.event };
      }

      default:
        logger.debug({ event: payload.event }, 'Unhandled webhook event');
        return { handled: false, event: payload.event };
    }
  },

  /** Admin-initiated refund. Only a captured payment can be refunded. */
  async refund(orderId: string, actorId: string, amount?: number) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);

    const paid = order.payments.find((payment) => payment.status === 'PAID' && payment.razorpayPaymentId);
    if (!paid?.razorpayPaymentId) {
      throw ApiError.badRequest('No captured payment found for this order', ErrorCode.PAYMENT_NOT_FOUND);
    }

    const refundAmount = amount !== undefined ? new Prisma.Decimal(amount) : paid.amount;
    if (refundAmount.greaterThan(paid.amount.sub(paid.amountRefunded))) {
      throw ApiError.badRequest('Refund amount exceeds the remaining refundable balance');
    }

    const refund = await refundRazorpayPayment({
      paymentId: paid.razorpayPaymentId,
      amountInSubunits: toSubunits(refundAmount),
      notes: { orderNumber: order.orderNumber },
    });

    const fullyRefunded = paid.amountRefunded.add(refundAmount).greaterThanOrEqualTo(paid.amount);

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paid.id },
        data: {
          amountRefunded: { increment: refundAmount },
          status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          ...(fullyRefunded ? { status: 'REFUNDED', refundedAt: new Date() } : {}),
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId,
          status: fullyRefunded ? 'REFUNDED' : order.status,
          note: `Refund of ₹${refundAmount.toString()} processed (${refund.id})`,
          actorId,
        },
      });
    });

    logger.info({ orderId, refundId: refund.id, amount: refundAmount.toString() }, 'Refund processed');

    return orderService.getAdmin(orderId);
  },

  /**
   * Exposed to the client so checkout.js can be initialised. The key *id* is public by
   * design; the key secret and webhook secret never leave the server.
   */
  getPublicConfig() {
    return {
      keyId: env.RAZORPAY_KEY_ID ?? null,
      currency: PRICING.CURRENCY,
      enabled: isRazorpayConfigured,
    };
  },
};
