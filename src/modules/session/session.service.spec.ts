import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from './session.service';

describe('SessionService tip payments', () => {
  it('does not record a completed tip without a payment provider', async () => {
    const prisma = {
      customerSession: { findFirst: jest.fn(), update: jest.fn() },
      customerTransaction: { create: jest.fn() },
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.submitTip('customer-1', 'session-1', 100))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.customerSession.update).not.toHaveBeenCalled();
    expect(prisma.customerTransaction.create).not.toHaveBeenCalled();
  });
});
