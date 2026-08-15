import { Injectable, NotFoundException } from '@nestjs/common';
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
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addPaymentMethod(customerId: string, data: {
    type: string;
    title: string;
    sub?: string;
    icon?: string;
    maskedNumber?: string;
    isDefault?: boolean;
  }) {
    if (data.isDefault) {
      await this.prisma.customerPaymentMethod.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerPaymentMethod.create({
      data: {
        customerId,
        type: data.type as any,
        title: data.title,
        sub: data.sub,
        icon: data.icon,
        maskedNumber: data.maskedNumber,
        isDefault: data.isDefault ?? false,
      },
    });
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
    await this.prisma.customerPaymentMethod.updateMany({
      where: { customerId },
      data: { isDefault: false },
    });
    return this.prisma.customerPaymentMethod.update({
      where: { id: methodId },
      data: { isDefault: true },
    });
  }

  async getBankAccounts(customerId: string) {
    return this.prisma.customerPaymentMethod.findMany({
      where: { customerId, type: 'bank_account' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addBankAccount(customerId: string, data: { accName: string; accNumber: string; ifsc: string }) {
    const last4 = data.accNumber.slice(-4);
    return this.prisma.customerPaymentMethod.create({
      data: {
        customerId,
        type: 'bank_account',
        title: 'Verified Bank Account',
        sub: `Account ending in ${last4}`,
        icon: 'bank',
        maskedNumber: `•••• ${last4}`,
        isDefault: false,
      },
    });
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
      where: { customerId, type: { in: ['bank_account', 'upi'] } },
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

  async withdrawMoney(customerId: string, data: { amount: number; methodId?: string; type?: string }) {
    const wallet = await this.prisma.customerWallet.findUnique({ where: { customerId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (data.amount < 100) {
      throw new Error('Minimum withdrawal amount is ₹100');
    }
    if (data.amount > wallet.balance) {
      throw new Error('Insufficient wallet balance');
    }

    // Deduct from wallet and create transaction
    const [updatedWallet, tx] = await this.prisma.$transaction([
      this.prisma.customerWallet.update({
        where: { customerId },
        data: { balance: { decrement: data.amount } },
      }),
      this.prisma.customerTransaction.create({
        data: {
          customerId,
          type: 'withdrawal',
          amount: data.amount,
          description: `Withdrawal of ₹${data.amount} to payout account`,
          status: 'completed',
        },
      }),
    ]);

    return {
      success: true,
      message: `₹${data.amount} withdrawal processed successfully`,
      newBalance: updatedWallet.balance,
      transactionId: tx.id,
    };
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
