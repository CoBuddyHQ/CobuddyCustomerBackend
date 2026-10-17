import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

// Razorpay SDK
const Razorpay = require('razorpay');

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

  private assertPaymentSignature(orderId: string, paymentId: string, signature: string) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new ServiceUnavailableException('Payment verification is not configured.');
    }
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      throw new BadRequestException('Payment verification failed: invalid signature');
    }
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest();
    const provided = Buffer.from(signature, 'hex');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(expected, provided)) {
      throw new BadRequestException('Payment verification failed: invalid signature');
    }
  }

  async createOrder(customerId: string, bookingId: string, amountOverride?: number) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new BadRequestException('Booking not found');

    const amount = amountOverride ?? booking.totalAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Booking amount must be a positive server-calculated value.');
    }
    const amountInPaise = Math.round(amount * 100);
    const receipt = `order_${bookingId}_${Date.now()}`;

    let rzpOrder: any;
    try {
      rzpOrder = await this.getRazorpayClient().orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: { bookingId, customerId },
      });
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn('Razorpay order creation failed; no order was stored.');
      throw new ServiceUnavailableException('Payment gateway is unavailable. No payment order was created.');
    }

    // Store in DB
    const order = await this.prisma.customerRazorpayOrder.create({
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

  async verifyPayment(customerId: string, body: any) {
    const razorpay_order_id = body.razorpay_order_id || body.razorpayOrderId;
    const razorpay_payment_id = body.razorpay_payment_id || body.razorpayPaymentId;
    const razorpay_signature = body.razorpay_signature || body.razorpaySignature;

    if (
      typeof razorpay_order_id !== 'string' ||
      !razorpay_order_id ||
      typeof razorpay_payment_id !== 'string' ||
      !razorpay_payment_id ||
      typeof razorpay_signature !== 'string' ||
      !razorpay_signature
    ) {
      throw new BadRequestException('Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature');
    }

    // 1. Verify HMAC SHA256 signature using constant-time comparison
    this.assertPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    // 2. Find order and verify ownership (IDOR check)
    const order = await this.prisma.customerRazorpayOrder.findUnique({
      where: { orderId: razorpay_order_id },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.customerId !== customerId) {
      throw new BadRequestException('Unauthorized: order does not belong to this customer');
    }

    // 3. Idempotent check — prevent duplicate processing
    if (order.status === 'paid') {
      if (order.paymentId !== razorpay_payment_id) {
        throw new BadRequestException('This order was already paid with a different payment.');
      }
      return {
        message: 'Payment already verified',
        paymentId: order.paymentId ?? razorpay_payment_id,
      };
    }

    // 4. Atomic transaction updating Order + Booking + Transaction Ledger
    const processed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerRazorpayOrder.updateMany({
        where: { orderId: razorpay_order_id, status: 'created' },
        data: {
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          status: 'paid',
        },
      });
      if (!claimed.count) {
        const current = await tx.customerRazorpayOrder.findUnique({ where: { orderId: razorpay_order_id } });
        if (current?.status === 'paid' && current.paymentId === razorpay_payment_id) return false;
        throw new BadRequestException('Payment order is no longer payable.');
      }

      if (order.bookingId) {
        await tx.customerBooking.update({
          where: { id: order.bookingId },
          data: { paymentStatus: 'completed', status: 'confirmed' },
        });

        await tx.customerTransaction.create({
          data: {
            customerId,
            bookingId: order.bookingId,
            type: 'session_payment',
            amount: order.amount,
            description: `Session payment`,
            paymentSource: `Razorpay: ${razorpay_payment_id}`,
            referenceId: razorpay_payment_id,
            status: 'completed',
          },
        });
      }
      return true;
    });

    return {
      message: processed ? 'Payment verified successfully' : 'Payment already verified',
      paymentId: razorpay_payment_id,
    };
  }

  async getOrderStatus(customerId: string, orderId: string) {
    const order = await this.prisma.customerRazorpayOrder.findFirst({
      where: { orderId, customerId },
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
      throw new BadRequestException('Top-up amount must be between ₹100 and ₹10,000, with at most two decimal places.');
    }
    const amountInPaise = Math.round(amount * 100);
    const receipt = `topup_${customerId}_${Date.now()}`;

    let rzpOrder: any;
    try {
      rzpOrder = await this.getRazorpayClient().orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: { customerId, purpose: 'wallet_topup' },
      });
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn('Razorpay wallet top-up order creation failed; no order was stored.');
      throw new ServiceUnavailableException('Payment gateway is unavailable. No top-up order was created.');
    }

    const order = await this.prisma.customerRazorpayOrder.create({
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

  async verifyWalletTopup(customerId: string, body: any) {
    const razorpay_order_id = body.razorpay_order_id || body.razorpayOrderId;
    const razorpay_payment_id = body.razorpay_payment_id || body.razorpayPaymentId;
    const razorpay_signature = body.razorpay_signature || body.razorpaySignature;

    if (
      typeof razorpay_order_id !== 'string' ||
      !razorpay_order_id ||
      typeof razorpay_payment_id !== 'string' ||
      !razorpay_payment_id ||
      typeof razorpay_signature !== 'string' ||
      !razorpay_signature
    ) {
      throw new BadRequestException('Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature');
    }

    this.assertPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    // 2. Find order and enforce ownership (IDOR check)
    const order = await this.prisma.customerRazorpayOrder.findUnique({
      where: { orderId: razorpay_order_id },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.customerId !== customerId) {
      throw new BadRequestException('Unauthorized: order does not belong to this customer');
    }

    // 3. Idempotency check — prevent double top-up
    if (order.status === 'paid') {
      if (order.paymentId !== razorpay_payment_id) {
        throw new BadRequestException('This top-up order was already paid with a different payment.');
      }
      return {
        message: 'Wallet top-up already verified',
        paymentId: order.paymentId ?? razorpay_payment_id,
        amount: order.amount,
      };
    }

    // 4. Atomic transaction updating Order + Wallet + Transaction Ledger
    const processed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerRazorpayOrder.updateMany({
        where: { orderId: razorpay_order_id, status: 'created' },
        data: { paymentId: razorpay_payment_id, signature: razorpay_signature, status: 'paid' },
      });
      if (!claimed.count) {
        const current = await tx.customerRazorpayOrder.findUnique({ where: { orderId: razorpay_order_id } });
        if (current?.status === 'paid' && current.paymentId === razorpay_payment_id) return false;
        throw new BadRequestException('Top-up order is no longer payable.');
      }

      await tx.customerWallet.update({
        where: { customerId },
        data: { balance: { increment: order.amount } },
      });

      await tx.customerTransaction.create({
        data: {
          customerId,
          type: 'add_money',
          amount: order.amount,
          description: 'Wallet top-up',
          paymentSource: `Razorpay: ${razorpay_payment_id}`,
          referenceId: razorpay_payment_id,
          status: 'completed',
        },
      });
      return true;
    });

    return {
      message: processed ? 'Wallet credited successfully' : 'Wallet top-up already verified',
      amount: order.amount,
      paymentId: razorpay_payment_id,
    };
  }

  // ── RAZORPAY WEBHOOK HANDLER ──────────────────────────────────────────────
  async handleWebhook(signature: string, rawBody: Buffer | string) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Payment webhook verification is not configured.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureMatches =
      /^[a-f0-9]{64}$/i.test(signature) &&
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(signature, 'hex'));

    if (!signatureMatches) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString());
    this.logger.log(`Razorpay customer webhook event received: ${payload.event}`);

    // Handle payment.captured
    if (payload.event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (typeof orderId !== 'string' || typeof paymentId !== 'string') {
        throw new BadRequestException('Captured payment webhook is missing its order or payment identifier.');
      }
      const order = await this.prisma.customerRazorpayOrder.findUnique({ where: { orderId } });
      if (!order) return { received: true, event: payload.event, processed: false };
      if (
        Number(paymentEntity?.amount) !== Math.round(order.amount * 100) ||
        paymentEntity?.currency !== order.currency
      ) {
        throw new BadRequestException('Captured payment amount or currency does not match the order.');
      }
      if (order.status === 'paid') {
        if (order.paymentId !== paymentId) {
          throw new BadRequestException('Captured payment does not match the payment already recorded.');
        }
        return { received: true, event: payload.event, processed: true };
      }

      const processed = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.customerRazorpayOrder.updateMany({
          where: { orderId, status: 'created' },
          data: { status: 'paid', paymentId },
        });
        if (!claimed.count) return false;

        if (order.bookingId) {
          await tx.customerBooking.update({
            where: { id: order.bookingId },
            data: { paymentStatus: 'completed', status: 'confirmed' },
          });
          await tx.customerTransaction.create({
            data: {
              customerId: order.customerId,
              bookingId: order.bookingId,
              type: 'session_payment',
              amount: order.amount,
              description: 'Session payment',
              paymentSource: 'Razorpay',
              referenceId: paymentId,
              status: 'completed',
            },
          });
        } else {
          await tx.customerWallet.update({
            where: { customerId: order.customerId },
            data: { balance: { increment: order.amount } },
          });
          await tx.customerTransaction.create({
            data: {
              customerId: order.customerId,
              type: 'add_money',
              amount: order.amount,
              description: 'Wallet top-up',
              paymentSource: 'Razorpay',
              referenceId: paymentId,
              status: 'completed',
            },
          });
        }
        return true;
      });
      return { received: true, event: payload.event, processed };
    }

    return { received: true, event: payload.event };
  }
}
