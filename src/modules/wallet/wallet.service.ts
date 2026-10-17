import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getBalance(customerId: string) {
    const wallet = await this.prisma.customerWallet.findUnique({
      where: { customerId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { kycStatus: true },
    });

    return {
      balance: wallet.balance,
      pendingRefunds: wallet.pendingRefunds,
      escrowHeld: wallet.escrowHeld,
      currency: wallet.currency,
      kycStatus: customer?.kycStatus ?? 'unverified',
      // KYC limit rule: unverified = ₹10,000 max
      kycLimit: customer?.kycStatus !== 'verified' ? 10000 : null,
    };
  }

  async getTransactions(customerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.prisma.customerTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.customerTransaction.count({ where: { customerId } }),
    ]);

    return {
      transactions: transactions.map(this.buildTransactionResponse),
      data: transactions.map(this.buildTransactionResponse),
      // Top-level for frontend: raw?.total ?? raw?.data?.length
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      // Nested for backwards compat
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransaction(customerId: string, txId: string) {
    const tx = await this.prisma.customerTransaction.findFirst({
      where: { id: txId, customerId },
      include: { booking: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return this.buildTransactionResponse(tx);
  }

  async getPaymentMethods(customerId: string) {
    return this.prisma.customerPaymentMethod.findMany({
      where: { customerId, isVerified: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addPaymentMethod(_customerId: string, _data: {
    type: string;
    title: string;
    sub?: string;
    icon?: string;
    maskedNumber?: string;
    isDefault?: boolean;
  }) {
    throw new ServiceUnavailableException(
      'Secure payment-method tokenization is not configured. No payment method was stored.',
    );
  }

  async deletePaymentMethod(customerId: string, methodId: string) {
    const method = await this.prisma.customerPaymentMethod.findFirst({
      where: { id: methodId, customerId },
    });
    if (!method) throw new NotFoundException('Payment method not found');
    await this.prisma.customerPaymentMethod.delete({ where: { id: methodId } });
    return { message: 'Payment method removed' };
  }

  async setDefaultPaymentMethod(customerId: string, methodId: string) {
    return this.prisma.$transaction(async (tx) => {
      const method = await tx.customerPaymentMethod.findFirst({
        where: { id: methodId, customerId, isVerified: true },
        select: { id: true },
      });
      if (!method) throw new NotFoundException('Verified payment method not found');
      await tx.customerPaymentMethod.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
      await tx.customerPaymentMethod.updateMany({
        where: { id: method.id, customerId, isVerified: true },
        data: { isDefault: true },
      });
      return tx.customerPaymentMethod.findFirst({ where: { id: method.id, customerId } });
    });
  }

  async getBankAccounts(customerId: string) {
    return this.prisma.customerPaymentMethod.findMany({
      where: { customerId, type: 'bank_account', isVerified: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addBankAccount(_customerId: string, _data: { accName: string; accNumber: string; ifsc: string }) {
    throw new ServiceUnavailableException(
      'Bank-account verification is not configured. No bank account was saved.',
    );
  }

  async deleteBankAccount(customerId: string, id: string) {
    const bank = await this.prisma.customerPaymentMethod.findFirst({
      where: { id, customerId, type: 'bank_account' },
    });
    if (!bank) throw new NotFoundException('Bank account not found');
    await this.prisma.customerPaymentMethod.delete({ where: { id } });
    return { message: 'Bank account deleted successfully' };
  }

  async getWithdrawalMethods(customerId: string) {
    const methods = await this.prisma.customerPaymentMethod.findMany({
      where: { customerId, isVerified: true, type: { in: ['bank_account', 'upi'] } },
      orderBy: { createdAt: 'desc' },
    });
    return methods.map((m) => ({
      id: m.id,
      type: m.type === 'bank_account' ? 'bank' : 'upi',
      title: m.title,
      sub: m.sub ?? m.maskedNumber ?? '',
      icon: m.icon ?? (m.type === 'bank_account' ? 'bank' : 'cellphone-wireless'),
      isDefault: m.isDefault,
    }));
  }

  async withdrawMoney(_customerId: string, _data: { amount: number; methodId?: string; type?: string }) {
    throw new ServiceUnavailableException(
      'Payout processing is not configured. No funds were debited or transfer initiated.',
    );
  }
  private buildTransactionResponse(tx: any) {
    return {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      paymentSource: tx.paymentSource,
      referenceId: tx.referenceId,
      status: tx.status,
      positive: ['add_money', 'refund', 'escrow_release'].includes(tx.type),
      createdAt: tx.createdAt,
      booking: tx.booking ? {
        id: tx.booking.id,
        activityName: tx.booking.activityName,
        companionName: tx.booking.companionName,
      } : null,
    };
  }
}
