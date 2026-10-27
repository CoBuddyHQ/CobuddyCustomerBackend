import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: {
            customerWallet: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            customer: {
              findUnique: jest.fn(),
            },
            customerPaymentMethod: {
              create: jest.fn(),
              findFirst: jest.fn(),
              updateMany: jest.fn(),
            },
            customerTransaction: {
              findMany: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalance', () => {
    it('should throw NotFoundException if wallet not found', async () => {
      jest.spyOn(prisma.customerWallet, 'findUnique').mockResolvedValue(null);
      await expect(service.getBalance('cust_1')).rejects.toThrow(NotFoundException);
    });

    it('should return wallet balance and kyc status', async () => {
      jest.spyOn(prisma.customerWallet, 'findUnique').mockResolvedValue({
        id: 'w_1',
        customerId: 'cust_1',
        balance: 500,
        pendingRefunds: 0,
        escrowHeld: 0,
        currency: 'INR',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
        kycStatus: 'verified',
      } as any);

      const res = await service.getBalance('cust_1');
      expect(res.balance).toBe(500);
      expect(res.kycStatus).toBe('verified');
      expect(res.kycLimit).toBeNull();
    });
  });

  describe('withdrawMoney', () => {
    it('fails closed without debiting the wallet or creating a completed payout', async () => {
      await expect(service.withdrawMoney('cust_1', { amount: 2000 }))
        .rejects.toThrow(ServiceUnavailableException);
      expect(prisma.customerWallet.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('does not save a bank account without a verification provider', async () => {
    await expect(service.addBankAccount('cust_1', {
      accName: 'Test Customer',
      accNumber: '0000000000',
      ifsc: 'TEST0000000',
    })).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.customerPaymentMethod.create).not.toHaveBeenCalled();
  });

  it('does not save a payment method without secure provider tokenization', async () => {
    await expect(service.addPaymentMethod('cust_1', {
      type: 'card',
      title: 'Card ending in 0000',
    })).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.customerPaymentMethod.create).not.toHaveBeenCalled();
  });

  it('checks payment-method ownership before changing any customer default', async () => {
    const tx = {
      customerPaymentMethod: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(tx));

    await expect(service.setDefaultPaymentMethod('customer-a', 'customer-b-method'))
      .rejects.toThrow(NotFoundException);
    expect(tx.customerPaymentMethod.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-b-method', customerId: 'customer-a', isVerified: true },
      select: { id: true },
    });
    expect(tx.customerPaymentMethod.updateMany).not.toHaveBeenCalled();
  });
});
