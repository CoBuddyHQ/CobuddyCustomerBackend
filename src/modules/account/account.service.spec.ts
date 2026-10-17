import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QA_TEST_OTP, RETIRED_QA_TEST_OTP } from '../../common/utils/otp-test.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountService } from './account.service';

describe('AccountService mobile number change', () => {
  const oldEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...oldEnvironment };
  });

  it('does not claim or store OTPs when no SMS sender is integrated', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.OTP_TEST_BYPASS_ENABLED;
    delete process.env.OTP_TEST_ALLOWED_PHONES;
    delete process.env.SMS_PROVIDER;
    delete process.env.MSG91_AUTH_KEY;

    const prisma = {
      customer: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'customer-1', phone: '+910000000001' })
          .mockResolvedValueOnce(null),
      },
      customerOtp: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const service = new AccountService(prisma as unknown as PrismaService);

    await expect(
      service.requestChangeMobileOtp('customer-1', '+910000000001', '+910000000002'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerOtp.deleteMany).not.toHaveBeenCalled();
    expect(prisma.customerOtp.createMany).not.toHaveBeenCalled();
  });

  it('stores and verifies six-digit QA challenges for both allowlisted numbers', async () => {
    const oldPhone = '+919876543210';
    const newPhone = '+919000000001';
    process.env.NODE_ENV = 'test';
    process.env.OTP_TEST_BYPASS_ENABLED = 'true';
    process.env.OTP_TEST_ALLOWED_PHONES = [oldPhone, newPhone].join(',');
    const records: Record<string, { id: string; phone: string; otp: string; expiresAt: Date; attempts: number }> = {};
    const prisma = {
      customer: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => where.id
          ? { id: 'customer-1', phone: oldPhone }
          : null),
        update: jest.fn().mockResolvedValue({}),
      },
      customerOtp: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockImplementation(async ({ data }) => {
          for (const row of data) records[row.phone] = { ...row, id: row.phone, attempts: 0 };
          return { count: data.length };
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }) => records[where.phone]),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    const service = new AccountService(prisma as unknown as PrismaService);

    await service.requestChangeMobileOtp('customer-1', oldPhone, newPhone);
    expect(/^\d{6}$/.test(QA_TEST_OTP)).toBe(true);
    for (const row of Object.values(records)) {
      expect(row.otp === QA_TEST_OTP).toBe(false);
      await expect(bcrypt.compare(QA_TEST_OTP, row.otp)).resolves.toBe(true);
    }
    await expect(service.verifyChangeMobile('customer-1', oldPhone, newPhone, QA_TEST_OTP, QA_TEST_OTP))
      .resolves.toMatchObject({ success: true, newPhone });
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { phone: newPhone } });
  });

  it.each(['disabled', 'production', 'removed', 'retired'] as const)(
    'rejects reserved QA number-change codes when authorization is %s',
    async (reason) => {
      const oldPhone = '+919876543210';
      const newPhone = '+919000000001';
      process.env.NODE_ENV = reason === 'production' ? 'production' : 'test';
      process.env.OTP_TEST_BYPASS_ENABLED = reason === 'disabled' ? 'false' : 'true';
      process.env.OTP_TEST_ALLOWED_PHONES = reason === 'removed' ? newPhone : [oldPhone, newPhone].join(',');
      const prisma = {
        customer: {
          findUnique: jest.fn().mockResolvedValueOnce({ id: 'customer-1', phone: oldPhone }).mockResolvedValueOnce(null),
          update: jest.fn(),
        },
        customerOtp: { findFirst: jest.fn() },
      };
      const service = new AccountService(prisma as unknown as PrismaService);
      const submitted = reason === 'retired' ? RETIRED_QA_TEST_OTP : QA_TEST_OTP;
      await expect(service.verifyChangeMobile('customer-1', oldPhone, newPhone, submitted, submitted))
        .rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.customerOtp.findFirst).not.toHaveBeenCalled();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    },
  );
});
