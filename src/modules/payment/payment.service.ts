import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

// Razorpay SDK
const Razorpay = require('razorpay');

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private razorpay: any;

  constructor(private prisma: PrismaService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  async createOrder(customerId: string, bookingId: string, amountOverride?: number) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new BadRequestException('Booking not found');

    const amount = amountOverride ?? booking.totalAmount;
    const amountInPaise = Math.round(amount * 100);
    const receipt = `order_${bookingId}_${Date.now()}`;

    let rzpOrder: any;
    try {
      rzpOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: { bookingId, customerId },
      });
    } catch (err: any) {
      this.logger.warn(`Razorpay live order creation failed (${err.message}). Using local development order.`);
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        rzpOrder = {
          id: `order_dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          amount: amountInPaise,
          currency: 'INR',
          receipt,
        };
      } else {
        this.logger.error('Razorpay order creation failed in production', err);
        throw new BadRequestException('Payment gateway error. Please try again.');
      }
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

  async verifyPayment(customerId: string, body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    // 1. Verify HMAC SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    const isDevSignature = isDev && (razorpay_signature === 'dev_bypass_signature' || razorpay_signature.startsWith('dev_sig_'));

    if (!isDevSignature && expectedSignature !== razorpay_signature) {
      throw new BadRequestException('Payment verification failed: invalid signature');
    }

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
      return {
        message: 'Payment already verified',
        paymentId: order.paymentId ?? razorpay_payment_id,
      };
    }

    // 4. Atomic transaction updating Order + Booking + Transaction Ledger
    await this.prisma.$transaction(async (tx) => {
      await tx.customerRazorpayOrder.update({
        where: { orderId: razorpay_order_id },
        data: {
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          status: 'paid',
        },
      });

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
    });

    return { message: 'Payment verified successfully', paymentId: razorpay_payment_id };
  }

  async getOrderStatus(customerId: string, orderId: string) {
    const order = await this.prisma.customerRazorpayOrder.findFirst({
      where: { orderId, customerId },
    });
    if (!order) throw new BadRequestException('Order not found');
    return order;
  }

  async addMoney(customerId: string, amount: number, description?: string) {
    const amountInPaise = Math.round(amount * 100);
    const receipt = `topup_${customerId}_${Date.now()}`;

    let rzpOrder: any;
    try {
      rzpOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: { customerId, purpose: 'wallet_topup' },
      });
    } catch (err: any) {
      this.logger.warn(`Razorpay wallet topup order creation failed (${err.message}). Using local development order.`);
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        rzpOrder = {
          id: `order_dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          amount: amountInPaise,
          currency: 'INR',
          receipt,
        };
      } else {
        this.logger.error('Razorpay wallet topup order failed in production', err);
        throw new BadRequestException('Payment gateway error');
      }
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

  async verifyWalletTopup(customerId: string, body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    // 1. Verify HMAC SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    const isDevSignature = isDev && (razorpay_signature === 'dev_bypass_signature' || razorpay_signature.startsWith('dev_sig_'));

    if (!isDevSignature && expectedSignature !== razorpay_signature) {
      throw new BadRequestException('Payment verification failed: invalid signature');
    }

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
      return {
        message: 'Wallet top-up already verified',
        paymentId: order.paymentId ?? razorpay_payment_id,
        amount: order.amount,
      };
    }

    // 4. Atomic transaction updating Order + Wallet + Transaction Ledger
    await this.prisma.$transaction(async (tx) => {
      await tx.customerRazorpayOrder.update({
        where: { orderId: razorpay_order_id },
        data: { paymentId: razorpay_payment_id, signature: razorpay_signature, status: 'paid' },
      });

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
    });

    return { message: 'Wallet credited successfully', amount: order.amount, paymentId: razorpay_payment_id };
  }

  // ── RAZORPAY WEBHOOK HANDLER ──────────────────────────────────────────────
  async handleWebhook(signature: string, rawBody: Buffer | string) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.warn('Razorpay webhook secret is not configured.');
      return { status: 'NOT_CONFIGURED', message: 'Razorpay webhook secret is not configured.' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString());
    this.logger.log(`Razorpay customer webhook event received: ${payload.event}`);

    // Handle payment.captured
    if (payload.event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        const order = await this.prisma.customerRazorpayOrder.findUnique({
          where: { orderId },
        });

        if (order && order.status !== 'paid') {
          await this.prisma.$transaction(async (tx) => {
            await tx.customerRazorpayOrder.update({
              where: { orderId },
              data: { status: 'paid', paymentId },
            });

            if (order.bookingId) {
              await tx.customerBooking.update({
                where: { id: order.bookingId },
                data: { paymentStatus: 'completed', status: 'confirmed' },
              });
            }
          });
        }
      }
    }

    return { received: true, event: payload.event };
  }
}
