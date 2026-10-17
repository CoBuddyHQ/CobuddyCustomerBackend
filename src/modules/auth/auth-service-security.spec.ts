import { ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('Customer AuthService OTP delivery', () => {
  const originalEnv = process.env;
  let prisma: {
    customerOtp: { deleteMany: jest.Mock; create: jest.Mock };
  };
  let service: AuthService;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test', OTP_TEST_BYPASS_ENABLED: 'false' };
    delete process.env.OTP_TEST_ALLOWED_PHONES;
    prisma = {
      customerOtp: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuthService(prisma as unknown as PrismaService, {} as JwtService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 503 without persisting an OTP when no SMS sender is integrated', async () => {
    await expect(service.sendOtp({ phone: '9876543210' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.customerOtp.deleteMany).not.toHaveBeenCalled();
    expect(prisma.customerOtp.create).not.toHaveBeenCalled();
  });

  it('reports QA preparation without claiming an SMS was sent', async () => {
    process.env.OTP_TEST_BYPASS_ENABLED = 'true';
    process.env.OTP_TEST_ALLOWED_PHONES = '9876543210';

    await expect(service.sendOtp({ phone: '9876543210' })).resolves.toEqual({
      message: 'QA test OTP prepared; no SMS was sent.',
    });
    expect(prisma.customerOtp.create).toHaveBeenCalledTimes(1);
    const storedOtp = prisma.customerOtp.create.mock.calls[0][0].data.otp;
    expect(storedOtp).not.toBe('12345465');
    await expect(bcrypt.compare('12345465', storedOtp)).resolves.toBe(true);
  });
});
