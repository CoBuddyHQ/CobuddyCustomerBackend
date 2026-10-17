import { PrismaService } from '../../prisma/prisma.service';
import { KycService } from './kyc.service';

describe('KycService verification state', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAutoApprove = process.env.AUTO_APPROVE_KYC;

  afterEach(() => {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldAutoApprove === undefined) delete process.env.AUTO_APPROVE_KYC;
    else process.env.AUTO_APPROVE_KYC = oldAutoApprove;
  });

  it('never marks liveness verified without a real assessment provider', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTO_APPROVE_KYC = 'true';
    const prisma = {
      customerKyc: {
        upsert: jest.fn().mockResolvedValue({ customerId: 'customer-1' }),
        update: jest.fn(),
      },
      customer: { update: jest.fn() },
    };
    const service = new KycService(prisma as unknown as PrismaService);

    await expect(service.submitLiveness('customer-1', '/uploads/kyc/liveness/evidence.mp4'))
      .resolves.toMatchObject({ message: expect.stringContaining('No automated assessment') });
    expect(prisma.customerKyc.update).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
});
