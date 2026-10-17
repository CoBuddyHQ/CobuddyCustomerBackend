import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { QA_TEST_OTP, RETIRED_QA_TEST_OTP } from '../../common/utils/otp-test.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('Customer AuthService OTP delivery and QA authorization', () => {
  const originalEnv = process.env;
  const testPhone = '+919876543210';
  const makePrisma = () => ({
    customerOtp: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    customer: { findUnique: jest.fn().mockResolvedValue({ id: 'qa-customer', phone: testPhone }) },
    customerRefreshToken: { create: jest.fn().mockResolvedValue({}) },
  });
  let prisma: ReturnType<typeof makePrisma>;
  let service: AuthService;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test', OTP_TEST_BYPASS_ENABLED: 'false' };
    delete process.env.OTP_TEST_ALLOWED_PHONES;
    prisma = makePrisma();
    service = new AuthService(
      prisma as unknown as PrismaService,
      { signAsync: jest.fn().mockResolvedValue('local-test-token') } as unknown as JwtService,
    );
  });

  afterAll(() => { process.env = originalEnv; });

  const enableQa = () => {
    process.env.OTP_TEST_BYPASS_ENABLED = 'true';
    process.env.OTP_TEST_ALLOWED_PHONES = testPhone;
  };

  const storeChallenge = async (otp: string) => {
    const challenge = {
      id: 'qa-challenge', phone: testPhone, otp: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, verified: false,
    };
    prisma.customerOtp.findFirst.mockResolvedValue(challenge);
    return challenge;
  };

  it('returns 503 without persisting an OTP when no SMS sender is integrated', async () => {
    await expect(service.sendOtp({ phone: testPhone })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerOtp.deleteMany).not.toHaveBeenCalled();
    expect(prisma.customerOtp.create).not.toHaveBeenCalled();
  });

  it('stores a hashed six-digit QA challenge that the mobile form can submit', async () => {
    enableQa();
    const response = await service.sendOtp({ phone: testPhone });
    expect(response.message).toBe('QA test OTP prepared; no SMS was sent.');
    expect(response).not.toHaveProperty('otp');
    expect(response).not.toHaveProperty('devOtp');
    expect(/^\d{6}$/.test(QA_TEST_OTP)).toBe(true);
    const record = prisma.customerOtp.create.mock.calls[0][0].data;
    expect(record.otp === QA_TEST_OTP).toBe(false);
    await expect(bcrypt.compare(QA_TEST_OTP, record.otp)).resolves.toBe(true);
    prisma.customerOtp.findFirst.mockResolvedValue({ ...record, id: 'qa-challenge', attempts: 0, verified: false });
    await expect(service.verifyOtp({ phone: testPhone, otp: QA_TEST_OTP })).resolves.toMatchObject({ isNewCustomer: false });
    expect(prisma.customerOtp.delete).toHaveBeenCalledWith({ where: { id: 'qa-challenge' } });
  });

  it.each([
    ['disabled flag', { OTP_TEST_BYPASS_ENABLED: 'false' }],
    ['removed phone', { OTP_TEST_ALLOWED_PHONES: '+919000000001' }],
    ['production', { NODE_ENV: 'production' }],
  ])('rejects a stored QA hash after authorization changes: %s', async (_label, override) => {
    enableQa();
    await storeChallenge(QA_TEST_OTP);
    process.env = { ...process.env, ...override };
    await expect(service.verifyOtp({ phone: testPhone, otp: QA_TEST_OTP })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.customerOtp.update).toHaveBeenCalledWith({ where: { id: 'qa-challenge' }, data: { attempts: { increment: 1 } } });
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });

  it('rejects the retired eight-digit QA code even when its stored hash matches', async () => {
    enableQa();
    await storeChallenge(RETIRED_QA_TEST_OTP);
    await expect(service.verifyOtp({ phone: testPhone, otp: RETIRED_QA_TEST_OTP })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });

  it('preserves normal stored OTP verification with QA disabled', async () => {
    const normalOtp = '9'.repeat(6);
    await storeChallenge(normalOtp);
    await expect(service.verifyOtp({ phone: testPhone, otp: normalOtp })).resolves.toMatchObject({ isNewCustomer: false });
    expect(prisma.customerOtp.delete).toHaveBeenCalledWith({ where: { id: 'qa-challenge' } });
  });

  it.each(['production', 'unlisted'] as const)('never issues QA challenges for %s requests', async (reason) => {
    enableQa();
    if (reason === 'production') process.env.NODE_ENV = 'production';
    else process.env.OTP_TEST_ALLOWED_PHONES = '+919000000001';
    await expect(service.sendOtp({ phone: testPhone })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerOtp.create).not.toHaveBeenCalled();
  });

  it.each(['missing', 'expired', 'locked'] as const)('requires a valid challenge before QA verification: %s', async (state) => {
    enableQa();
    const challenge = await storeChallenge(QA_TEST_OTP);
    if (state === 'missing') prisma.customerOtp.findFirst.mockResolvedValue(null);
    if (state === 'expired') challenge.expiresAt = new Date(0);
    if (state === 'locked') challenge.attempts = 100;
    await expect(service.verifyOtp({ phone: testPhone, otp: QA_TEST_OTP })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });
});
