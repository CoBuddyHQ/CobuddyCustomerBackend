import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

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
    it('should throw BadRequestException if withdrawal amount is less than 1000', async () => {
      jest.spyOn(prisma.customerWallet, 'findUnique').mockResolvedValue({
        id: 'w_1',
        customerId: 'cust_1',
        balance: 5000,
      } as any);

      await expect(
        service.withdrawMoney('cust_1', { amount: 500 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if balance is insufficient', async () => {
      jest.spyOn(prisma.customerWallet, 'findUnique').mockResolvedValue({
        id: 'w_1',
        customerId: 'cust_1',
        balance: 500,
      } as any);

      await expect(
        service.withdrawMoney('cust_1', { amount: 2000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
