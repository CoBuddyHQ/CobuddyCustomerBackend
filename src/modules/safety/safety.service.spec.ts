import { PrismaService } from '../../prisma/prisma.service';
import { SafetyService } from './safety.service';

describe('SafetyService SOS delivery status', () => {
  it('records the SOS event without claiming contacts or dispatch were notified', async () => {
    const prisma = {
      customerSOS: { create: jest.fn().mockResolvedValue({ id: 'sos-1' }) },
      customerTrustedContact: { findMany: jest.fn().mockResolvedValue([{ phone: 'masked-in-test' }]) },
    };
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new SafetyService(prisma as unknown as PrismaService);

    await expect(service.triggerSOS('customer-1')).resolves.toMatchObject({
      sosId: 'sos-1',
      contactsNotified: false,
      dispatchStatus: 'NOT_CONFIGURED',
    });
    expect(log).not.toHaveBeenCalled();
    expect(prisma.customerSOS.create).toHaveBeenCalledWith({
      data: { customerId: 'customer-1', sessionId: null, lat: null, lng: null, status: 'active' },
    });
    log.mockRestore();
  });
});
