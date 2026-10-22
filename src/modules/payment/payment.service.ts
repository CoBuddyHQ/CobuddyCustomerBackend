import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CustomerRazorpayOrder, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

type PaymentVerification = {
  razorpay_order_id?: string;
  razorpayOrderId?: string;
  razorpay_payment_id?: string;
  razorpayPaymentId?: string;
  razorpay_signature?: string;
  razorpaySignature?: string;
};

type CapturedPayment = {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  captured?: unknown;
};

type ProviderOrder = { id: string };

async function createProviderOrder(
  create: (params: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }) => Promise<unknown>,
  params: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  },
): Promise<ProviderOrder> {
  const response = await create(params);
  if (
    !response ||
    typeof response !== 'object' ||
    !('id' in response) ||
    typeof response.id !== 'string' ||
    !response.id
  ) {
    throw new Error('Payment provider returned an invalid order response.');
  }
  return { id: response.id };
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private prisma: PrismaService) {}

  private getRazorpayClient() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Payment gateway is not configured. No payment order was created.',
      );
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  private assertPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new ServiceUnavailableException(
        'Payment verification is not configured.',
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      throw new BadRequestException(
        'Payment verification failed: invalid signature',
      );
    }
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest();
    const provided = Buffer.from(signature, 'hex');
    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(expected, provided)
    ) {
      throw new BadRequestException(
        'Payment verification failed: invalid signature',
      );
    }
  }

  private validateCapturedPayment(
    order: CustomerRazorpayOrder,
    paymentId: string,
    payment: CapturedPayment,
  ) {
    if (
      payment.id !== paymentId ||
      payment.order_id !== order.orderId ||
      payment.status !== 'captured' ||
      payment.captured !== true ||
      payment.amount !== Math.round(order.amount * 100) ||
      payment.currency !== order.currency
    ) {
      throw new BadRequestException(
        'Payment is not captured or does not match the stored order.',
      );
    }
  }

  private async confirmCapturedPayment(
    order: CustomerRazorpayOrder,
    paymentId: string,
  ) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Payment verification is not configured.',
      );
    }
    let payment: CapturedPayment;
    try {
      const response = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          },
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Provider verification failed');
      payment = (await response.json()) as CapturedPayment;
      if (!payment || typeof payment !== 'object')
        throw new Error('Invalid provider response');
    } catch {
      throw new ServiceUnavailableException(
        'Payment confirmation is temporarily unavailable. No credit was applied; retry verification.',
      );
    }
    this.validateCapturedPayment(order, paymentId, payment);
  }

  /** Shared settlement path for checkout and signed capture webhooks. */
  private async settleCapturedPayment(
    tx: Prisma.TransactionClient,
    order: CustomerRazorpayOrder,
    paymentId: string,
  ) {
    const claimed = await tx.customerRazorpayOrder.updateMany({
      where: { orderId: order.orderId, status: 'created' },
      data: { paymentId, status: 'paid' },
    });
    if (!claimed.count) {
      const current = await tx.customerRazorpayOrder.findUnique({
        where: { orderId: order.orderId },
      });
      if (current?.status === 'paid' && current.paymentId === paymentId)
        return false;
      throw new BadRequestException('Payment order is no longer payable.');
    }
    let bookingPaymentLinked = true;
    if (order.bookingId) {
      // A delayed capture must never reopen a cancelled/completed booking.
      // The captured funds remain recorded for reconciliation/refund.
      const linked = await tx.customerBooking.updateMany({
        where: {
          id: order.bookingId,
          customerId: order.customerId,
          status: 'accepted',
          paymentStatus: 'pending',
          totalAmount: order.amount,
        },
        data: { paymentStatus: 'completed', status: 'confirmed' },
      });
      bookingPaymentLinked = linked.count === 1;
    } else {
      await tx.customerWallet.update({
        where: { customerId: order.customerId },
        data: { balance: { increment: order.amount } },
      });
    }
    await tx.customerTransaction.create({
      data: {
        customerId: order.customerId,
        bookingId: order.bookingId,
        type: order.bookingId ? 'session_payment' : 'add_money',
        amount: order.amount,
        description: order.bookingId
          ? 'Captured session payment'
          : 'Wallet top-up',
        paymentSource: 'Razorpay',
        referenceId: paymentId,
        status: bookingPaymentLinked ? 'completed' : 'pending',
      },
    });
    return true;
  }

  private async bookingPaymentConfirmed(order: CustomerRazorpayOrder) {
    if (!order.bookingId) return true;
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: order.bookingId, customerId: order.customerId },
      select: { status: true, paymentStatus: true },
    });
    return booking?.status === 'confirmed' && booking.paymentStatus === 'completed';
  }

  async createOrder(customerId: string, bookingId: string) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new BadRequestException('Booking not found');
    if (booking.status !== 'accepted' || booking.paymentStatus !== 'pending') {
      throw new BadRequestException(
        'Only an accepted, unpaid booking can be paid.',
      );
    }

    const amount = booking.totalAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Booking amount must be a positive server-calculated value.',
      );
    }
    const amountInPaise = Math.round(amount * 100);
    // Provider receipts have a 40-character limit.
    const receipt = `bk_${crypto.randomUUID()}`;

    let rzpOrder: ProviderOrder;
    try {
      rzpOrder = await createProviderOrder(
        (params) => this.getRazorpayClient().orders.create(params),
        {
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: { bookingId, customerId },
        },
      );
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn('Razorpay order creation failed; no order was stored.');
      throw new ServiceUnavailableException(
        'Payment gateway is unavailable. No payment order was created.',
      );
    }

    // Store in DB
    await this.prisma.customerRazorpayOrder.create({
      data: {
        customerId,
        bookingId,
        orderId: rzpOrder.id,
        amount,
        currency: 'INR',
        receipt,
        status: 'created',
        description: `Booking: ${booking.activityName}`,
      },
    });

    return {
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: rzpOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      description: `Booking: ${booking.activityName}`,
    };
  }

  async verifyPayment(customerId: string, body: PaymentVerification) {
    const razorpay_order_id = body.razorpay_order_id || body.razorpayOrderId;
    const razorpay_payment_id =
      body.razorpay_payment_id || body.razorpayPaymentId;
    const razorpay_signature =
      body.razorpay_signature || body.razorpaySignature;

    if (
      typeof razorpay_order_id !== 'string' ||
      !razorpay_order_id ||
      typeof razorpay_payment_id !== 'string' ||
      !razorpay_payment_id ||
      typeof razorpay_signature !== 'string' ||
      !razorpay_signature
    ) {
      throw new BadRequestException(
        'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature',
      );
    }

    // 1. Verify HMAC SHA256 signature using constant-time comparison
    this.assertPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    // 2. Find order and verify ownership (IDOR check)
    const order = await this.prisma.customerRazorpayOrder.findUnique({
      where: { orderId: razorpay_order_id },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.customerId !== customerId) {
      throw new BadRequestException(
        'Unauthorized: order does not belong to this customer',
      );
    }
    if (!order.bookingId) {
      throw new BadRequestException(
        'A wallet top-up cannot be verified as a booking payment.',
      );
    }

    // 3. Idempotent check — prevent duplicate processing
    if (order.status === 'paid') {
      if (order.paymentId !== razorpay_payment_id) {
        throw new BadRequestException(
          'This order was already paid with a different payment.',
        );
      }
      const bookingConfirmed = await this.bookingPaymentConfirmed(order);
      return {
        message: bookingConfirmed
          ? 'Payment already verified'
          : 'Payment was captured; booking confirmation is pending reconciliation.',
        bookingStatus: bookingConfirmed ? 'confirmed' : 'reconciliation_required',
        paymentId: order.paymentId ?? razorpay_payment_id,
      };
    }

    await this.confirmCapturedPayment(order, razorpay_payment_id);

    // Signature authentication alone does not prove funds were captured.
    const processed = await this.prisma.$transaction(async (tx) => {
      return this.settleCapturedPayment(tx, order, razorpay_payment_id);
    });
    const bookingConfirmed = await this.bookingPaymentConfirmed(order);

    return {
      message: !bookingConfirmed
        ? 'Payment was captured; booking confirmation is pending reconciliation.'
        : processed
          ? 'Payment verified successfully'
          : 'Payment already verified',
      bookingStatus: bookingConfirmed ? 'confirmed' : 'reconciliation_required',
      paymentId: razorpay_payment_id,
    };
  }

  async getOrderStatus(customerId: string, orderId: string) {
    const order = await this.prisma.customerRazorpayOrder.findFirst({
      where: { orderId, customerId },
      select: {
        orderId: true,
        paymentId: true,
        bookingId: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!order) throw new BadRequestException('Order not found');
    return order;
  }

  async addMoney(customerId: string, amount: number, description?: string) {
    if (
      !Number.isFinite(amount) ||
      amount < 100 ||
      amount > 10000 ||
      Math.round(amount * 100) !== amount * 100
    ) {
      throw new BadRequestException(
        'Top-up amount must be between ₹100 and ₹10,000, with at most two decimal places.',
      );
    }
    const amountInPaise = Math.round(amount * 100);
    const receipt = `wu_${crypto.randomUUID()}`;

    let rzpOrder: ProviderOrder;
    try {
      rzpOrder = await createProviderOrder(
        (params) => this.getRazorpayClient().orders.create(params),
        {
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: { customerId, purpose: 'wallet_topup' },
        },
      );
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(
        'Razorpay wallet top-up order creation failed; no order was stored.',
      );
      throw new ServiceUnavailableException(
        'Payment gateway is unavailable. No top-up order was created.',
      );
    }

    await this.prisma.customerRazorpayOrder.create({
      data: {
        customerId,
        orderId: rzpOrder.id,
        amount,
        currency: 'INR',
        receipt,
        status: 'created',
        description: description ?? 'Wallet top-up',
      },
    });

    return {
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: rzpOrder.id,
      amount: amountInPaise,
      currency: 'INR',
    };
  }

  async verifyWalletTopup(customerId: string, body: PaymentVerification) {
    const razorpay_order_id = body.razorpay_order_id || body.razorpayOrderId;
    const razorpay_payment_id =
      body.razorpay_payment_id || body.razorpayPaymentId;
    const razorpay_signature =
      body.razorpay_signature || body.razorpaySignature;

    if (
      typeof razorpay_order_id !== 'string' ||
      !razorpay_order_id ||
      typeof razorpay_payment_id !== 'string' ||
      !razorpay_payment_id ||
      typeof razorpay_signature !== 'string' ||
      !razorpay_signature
    ) {
      throw new BadRequestException(
        'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature',
      );
    }

    this.assertPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    // 2. Find order and enforce ownership (IDOR check)
    const order = await this.prisma.customerRazorpayOrder.findUnique({
      where: { orderId: razorpay_order_id },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.customerId !== customerId) {
      throw new BadRequestException(
        'Unauthorized: order does not belong to this customer',
      );
    }
    if (order.bookingId) {
      throw new BadRequestException(
        'A booking payment cannot be credited to a wallet.',
      );
    }

    // 3. Idempotency check — prevent double top-up
    if (order.status === 'paid') {
      if (order.paymentId !== razorpay_payment_id) {
        throw new BadRequestException(
          'This top-up order was already paid with a different payment.',
        );
      }
      return {
        message: 'Wallet top-up already verified',
        paymentId: order.paymentId ?? razorpay_payment_id,
        amount: order.amount,
      };
    }

    await this.confirmCapturedPayment(order, razorpay_payment_id);

    const processed = await this.prisma.$transaction(async (tx) => {
      return this.settleCapturedPayment(tx, order, razorpay_payment_id);
    });

    return {
      message: processed
        ? 'Wallet credited successfully'
        : 'Wallet top-up already verified',
      amount: order.amount,
      paymentId: razorpay_payment_id,
    };
  }

  // ── RAZORPAY WEBHOOK HANDLER ──────────────────────────────────────────────
  async handleWebhook(signature: string, rawBody: Buffer | string) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Payment webhook verification is not configured.',
      );
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureMatches =
      /^[a-f0-9]{64}$/i.test(signature) &&
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex'),
      );

    if (!signatureMatches) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: {
      event?: string;
      payload?: { payment?: { entity?: CapturedPayment } };
    };
    try {
      payload = JSON.parse(rawBody.toString()) as typeof payload;
      if (!payload || typeof payload.event !== 'string')
        throw new Error('Invalid payload');
    } catch {
      throw new BadRequestException('Invalid payment webhook payload.');
    }
    this.logger.log('Authenticated payment webhook received.');

    // Handle payment.captured
    if (payload.event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (typeof orderId !== 'string' || typeof paymentId !== 'string') {
        throw new BadRequestException(
          'Captured payment webhook is missing its order or payment identifier.',
        );
      }
      const order = await this.prisma.customerRazorpayOrder.findUnique({
        where: { orderId },
      });
      if (!order)
        return { received: true, event: payload.event, processed: false };
      this.validateCapturedPayment(order, paymentId, paymentEntity!);
      if (order.status === 'paid') {
        if (order.paymentId !== paymentId) {
          throw new BadRequestException(
            'Captured payment does not match the payment already recorded.',
          );
        }
        return { received: true, event: payload.event, processed: true };
      }

      const processed = await this.prisma.$transaction(async (tx) => {
        return this.settleCapturedPayment(tx, order, paymentId);
      });
      return { received: true, event: payload.event, processed };
    }

    return { received: true, event: payload.event };
  }
}
