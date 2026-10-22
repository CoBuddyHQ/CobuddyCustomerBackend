import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentService } from './payment.service';

describe('PaymentService security boundaries', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  type TransactionMock = {
    customerRazorpayOrder: { findUnique: jest.Mock; updateMany: jest.Mock };
    customerWallet: { update: jest.Mock };
    customerBooking: { updateMany: jest.Mock };
    customerTransaction: { create: jest.Mock };
  };
  const tx = {
    customerRazorpayOrder: { findUnique: jest.fn(), updateMany: jest.fn() },
    customerWallet: { update: jest.fn() },
    customerBooking: { updateMany: jest.fn() },
    customerTransaction: { create: jest.fn() },
  };
  const prisma = {
    customerBooking: { findFirst: jest.fn() },
    customerRazorpayOrder: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: TransactionMock) => unknown) =>
      callback(tx),
    ),
  };
  const service = new PaymentService(prisma as any);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
    if (previousWebhookSecret === undefined)
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;
  });

  it('rejects development bypass signatures before reading or updating an order', async () => {
    process.env.RAZORPAY_KEY_SECRET = 'test-only-payment-secret';
    await expect(
      service.verifyPayment('customer', {
        razorpay_order_id: 'order-id',
        razorpay_payment_id: 'payment-id',
        razorpay_signature: 'dev_bypass_signature',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customerRazorpayOrder.findUnique).not.toHaveBeenCalled();
  });

  it('requires gateway credentials before creating an order, even in development', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    prisma.customerBooking.findFirst.mockResolvedValue({
      id: 'booking',
      totalAmount: 100,
      activityName: 'Activity',
      status: 'accepted',
      paymentStatus: 'pending',
    });
    await expect(
      service.createOrder('customer', 'booking'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerRazorpayOrder.create).not.toHaveBeenCalled();
  });

  it('accepts only a valid Razorpay HMAC when configured', () => {
    process.env.RAZORPAY_KEY_SECRET = 'test-only-payment-secret';
    const orderId = 'order-id';
    const paymentId = 'payment-id';
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET as string)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(() =>
      (service as any).assertPaymentSignature(orderId, paymentId, signature),
    ).not.toThrow();
  });

  it('does not acknowledge a webhook when signature verification is not configured', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await expect(service.handleWebhook('', '{}')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('credits a wallet top-up once after a verified captured-payment webhook', async () => {
    const secret = 'test-only-webhook-secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    const order = {
      orderId: 'order-id',
      paymentId: null,
      status: 'created',
      customerId: 'customer-1',
      bookingId: null,
      amount: 12.34,
      currency: 'INR',
    };
    prisma.customerRazorpayOrder.findUnique.mockResolvedValue(order);
    tx.customerRazorpayOrder.updateMany.mockResolvedValue({ count: 1 });
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            order_id: 'order-id',
            id: 'payment-id',
            amount: 1234,
            currency: 'INR',
            status: 'captured',
            captured: true,
          },
        },
      },
    });
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    await expect(
      service.handleWebhook(signature, rawBody),
    ).resolves.toMatchObject({
      received: true,
      event: 'payment.captured',
      processed: true,
    });
    expect(tx.customerRazorpayOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order-id', status: 'created' },
      }),
    );
    expect(tx.customerWallet.update).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
      data: { balance: { increment: 12.34 } },
    });
    expect(tx.customerTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('does not process the same captured-payment webhook twice', async () => {
    const secret = 'test-only-webhook-secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    prisma.customerRazorpayOrder.findUnique.mockResolvedValue({
      orderId: 'order-id',
      paymentId: 'payment-id',
      status: 'paid',
      customerId: 'customer-1',
      bookingId: null,
      amount: 12.34,
      currency: 'INR',
    });
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            order_id: 'order-id',
            id: 'payment-id',
            amount: 1234,
            currency: 'INR',
            status: 'captured',
            captured: true,
          },
        },
      },
    });
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    await service.handleWebhook(signature, rawBody);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.customerWallet.update).not.toHaveBeenCalled();
    expect(tx.customerTransaction.create).not.toHaveBeenCalled();
  });

  describe('capture and purpose verification', () => {
    const storedOrder = {
      orderId: 'order-id',
      paymentId: null,
      status: 'created',
      customerId: 'customer-1',
      bookingId: null,
      amount: 100,
      currency: 'INR',
    };
    const capturedPayment = {
      id: 'payment-id',
      order_id: 'order-id',
      amount: 10000,
      currency: 'INR',
      status: 'captured',
      captured: true,
    };
    const verification = () => ({
      razorpay_order_id: 'order-id',
      razorpay_payment_id: 'payment-id',
      razorpay_signature: crypto
        .createHmac('sha256', 'test-only-payment-secret')
        .update('order-id|payment-id')
        .digest('hex'),
    });
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      process.env.RAZORPAY_KEY_ID = 'test-only-key-id';
      process.env.RAZORPAY_KEY_SECRET = 'test-only-payment-secret';
      prisma.customerBooking.findFirst.mockResolvedValue({
        status: 'confirmed', paymentStatus: 'completed',
      });
      prisma.customerRazorpayOrder.findUnique.mockResolvedValue(storedOrder);
      tx.customerRazorpayOrder.updateMany.mockResolvedValue({ count: 1 });
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(capturedPayment),
      } as Response);
    });
    afterEach(() => fetchSpy.mockRestore());

    it('checks provider capture before crediting a top-up', async () => {
      await service.verifyWalletTopup('customer-1', verification());
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.razorpay.com/v1/payments/payment-id',
        expect.objectContaining({
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }),
      );
      expect(tx.customerWallet.update).toHaveBeenCalledWith({
        where: { customerId: 'customer-1' },
        data: { balance: { increment: 100 } },
      });
      expect(tx.customerTransaction.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      { status: 'authorized', captured: false },
      { amount: 1 },
      { currency: 'USD' },
      { order_id: 'another-order' },
      { id: 'another-payment' },
    ])('refuses mismatched or uncaptured evidence: %j', async (override) => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...capturedPayment, ...override }),
      } as Response);
      await expect(
        service.verifyWalletTopup('customer-1', verification()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not credit funds when the provider is unavailable', async () => {
      fetchSpy.mockRejectedValue(new Error('unavailable'));
      await expect(
        service.verifyWalletTopup('customer-1', verification()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a booking order submitted to the top-up endpoint', async () => {
      prisma.customerRazorpayOrder.findUnique.mockResolvedValue({
        ...storedOrder,
        bookingId: 'booking',
      });
      await expect(
        service.verifyWalletTopup('customer-1', verification()),
      ).rejects.toThrow('cannot be credited to a wallet');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a wallet order submitted to the booking endpoint', async () => {
      await expect(
        service.verifyPayment('customer-1', verification()),
      ).rejects.toThrow('cannot be verified as a booking payment');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not reopen a cancelled booking after a delayed captured payment', async () => {
      prisma.customerRazorpayOrder.findUnique.mockResolvedValue({
        ...storedOrder,
        bookingId: 'booking',
      });
      tx.customerBooking.updateMany.mockResolvedValue({ count: 0 });
      prisma.customerBooking.findFirst.mockResolvedValue({
        status: 'cancelled', paymentStatus: 'completed',
      });
      await expect(service.verifyPayment('customer-1', verification())).resolves.toMatchObject({
        message: 'Payment was captured; booking confirmation is pending reconciliation.',
        bookingStatus: 'reconciliation_required',
      });
      expect(tx.customerBooking.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'booking',
          customerId: 'customer-1',
          status: 'accepted',
          paymentStatus: 'pending',
          totalAmount: 100,
        },
        data: { status: 'confirmed', paymentStatus: 'completed' },
      });
      expect(tx.customerTransaction.create).toHaveBeenCalledTimes(1);
      expect(tx.customerTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
      }));
      expect(tx.customerWallet.update).not.toHaveBeenCalled();
    });

    it('rejects a foreign customer before calling the provider', async () => {
      await expect(
        service.verifyWalletTopup('another-customer', verification()),
      ).rejects.toThrow('does not belong');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
