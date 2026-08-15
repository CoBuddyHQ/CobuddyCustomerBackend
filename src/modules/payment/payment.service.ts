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
      this.logger.error('Razorpay order creation failed', err);
      throw new BadRequestException('Payment gateway error. Please try again.');
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
    // Verify signature
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      throw new BadRequestException('Payment verification failed: invalid signature');
    }

    // Find order
    const order = await this.prisma.customerRazorpayOrder.findUnique({
      where: { orderId: razorpay_order_id },
    });
    if (!order) throw new BadRequestException('Order not found');

    // Update order as paid
    await this.prisma.customerRazorpayOrder.update({
      where: { orderId: razorpay_order_id },
      data: {
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: 'paid',
      },
    });

    // Update booking payment status
    if (order.bookingId) {
      await this.prisma.customerBooking.update({
        where: { id: order.bookingId },
        data: { paymentStatus: 'completed', status: 'confirmed' },
      });

      // Deduct from wallet (escrow hold) and create transaction
      await this.prisma.customerTransaction.create({
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
      this.logger.error('Razorpay wallet topup order failed', err);
      throw new BadRequestException('Payment gateway error');
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
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      throw new BadRequestException('Payment verification failed');
    }

    const order = await this.prisma.customerRazorpayOrder.findUnique({
      where: { orderId: razorpay_order_id },
    });
    if (!order) throw new BadRequestException('Order not found');

    await this.prisma.customerRazorpayOrder.update({
      where: { orderId: razorpay_order_id },
      data: { paymentId: razorpay_payment_id, signature: razorpay_signature, status: 'paid' },
    });

    // Credit wallet
    await this.prisma.customerWallet.update({
      where: { customerId },
      data: { balance: { increment: order.amount } },
    });

    // Record transaction
    await this.prisma.customerTransaction.create({
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

    return { message: 'Wallet credited successfully', amount: order.amount };
  }
}
