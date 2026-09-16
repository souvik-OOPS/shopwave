import { createHmac, timingSafeEqual } from 'node:crypto';

import Razorpay from 'razorpay';

import { env, isRazorpayConfigured } from '@/config/env';
import { ApiError, ErrorCode } from '@/utils/ApiError';

/**
 * Razorpay integration. Two independent signature checks live here:
 *
 *   1. `verifyPaymentSignature` — the browser handshake after checkout.js succeeds.
 *   2. `verifyWebhookSignature` — the server-to-server callback, computed over the
 *      RAW request body. This one is authoritative; the browser can lie, the webhook
 *      cannot (without the secret).
 */
let instance: Razorpay | null = null;

if (isRazorpayConfigured) {
  instance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export function getRazorpay(): Razorpay {
  if (!instance) {
    throw ApiError.serviceUnavailable(
      'Payment gateway is not configured',
      ErrorCode.PAYMENT_NOT_CONFIGURED,
    );
  }
  return instance;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export async function createRazorpayOrder(params: {
  amountInSubunits: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrderResult> {
  const client = getRazorpay();

  try {
    const order = await client.orders.create({
      amount: params.amountInSubunits,
      currency: params.currency,
      receipt: params.receipt,
      payment_capture: true,
      notes: params.notes ?? {},
    });

    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      receipt: order.receipt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown gateway error';
    throw new ApiError(502, `Payment gateway error: ${message}`, ErrorCode.PAYMENT_GATEWAY_ERROR);
  }
}

/** Constant-time compare so signature checks cannot be timing-attacked. */
function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * HMAC-SHA256 of `${orderId}|${paymentId}` keyed with the API secret — exactly the
 * construction Razorpay documents for the client handshake.
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;

  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');

  return safeCompare(expected, params.signature);
}

/** Webhook signature is computed over the raw, unparsed body. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;

  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return safeCompare(expected, signature);
}

export async function fetchRazorpayPayment(paymentId: string): Promise<Record<string, unknown>> {
  const client = getRazorpay();
  try {
    return (await client.payments.fetch(paymentId)) as unknown as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown gateway error';
    throw new ApiError(502, `Payment gateway error: ${message}`, ErrorCode.PAYMENT_GATEWAY_ERROR);
  }
}

export async function refundRazorpayPayment(params: {
  paymentId: string;
  amountInSubunits: number;
  notes?: Record<string, string>;
}): Promise<{ id: string; status: string; amount: number }> {
  const client = getRazorpay();
  try {
    const refund = await client.payments.refund(params.paymentId, {
      amount: params.amountInSubunits,
      notes: params.notes ?? {},
    });
    return { id: refund.id, status: refund.status, amount: Number(refund.amount) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown gateway error';
    throw new ApiError(502, `Refund failed: ${message}`, ErrorCode.PAYMENT_GATEWAY_ERROR);
  }
}

export { isRazorpayConfigured };
