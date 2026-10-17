import { ServiceUnavailableException } from '@nestjs/common';
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
});
