import { Logger } from '@nestjs/common';
import { Logger } from '@nestjs/common';
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

describe('SafetyService report synchronization', () => {
  it('does not send a fabricated reported-user ID to Admin', async () => {
    const report = { id: 'report-1' };
    const prisma = { customerIncident: { create: jest.fn().mockResolvedValue(report) } };
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetch = jest.spyOn(global, 'fetch');
    const service = new SafetyService(prisma as unknown as PrismaService);

    await expect(service.createIncidentReport('customer-1', { description: 'Report without a user ID' }))
      .resolves.toEqual(report);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Admin S2S report sync skipped because the report has no reported-user ID.');
    jest.restoreAllMocks();
  });
});

describe('SafetyService Admin report synchronization', () => {
  const previousAdminUrl = process.env.ADMIN_API_URL;
  const previousInternalSecret = process.env.INTERNAL_SERVICE_SECRET;

  const createService = () => {
    const report = { id: 'report-12345678' };
    const prisma = {
      customerIncident: { create: jest.fn().mockResolvedValue(report) },
    };
    return { service: new SafetyService(prisma as unknown as PrismaService), report };
  };

  beforeEach(() => {
    delete process.env.ADMIN_API_URL;
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  afterEach(() => {
    if (previousAdminUrl === undefined) delete process.env.ADMIN_API_URL;
    else process.env.ADMIN_API_URL = previousAdminUrl;
    if (previousInternalSecret === undefined) delete process.env.INTERNAL_SERVICE_SECRET;
    else process.env.INTERNAL_SERVICE_SECRET = previousInternalSecret;
    jest.restoreAllMocks();
  });

  it('does not call Admin or use a fallback key when S2S configuration is missing', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetch = jest.spyOn(global, 'fetch');
    const { service, report } = createService();

    await expect(service.createIncidentReport('customer-1', {
      description: 'Test report',
      companionId: 'companion-1',
    })).resolves.toEqual(report);

    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('required configuration is missing.'));
  });

  it('uses configured S2S authentication and logs only an HTTP status on failure', async () => {
    process.env.ADMIN_API_URL = 'http://admin-backend:4000/';
    process.env.INTERNAL_SERVICE_SECRET = 'unit-test-secret';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    const { service } = createService();

    await service.createIncidentReport('customer-1', {
      description: 'Test report',
      companionId: 'companion-1',
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://admin-backend:4000/api/internal/reports/sync',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetch.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>)['x-internal-service-key']).toBeTruthy();
    expect(warn).toHaveBeenCalledWith('Admin S2S report sync returned HTTP 503.');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('unit-test-secret');
  });
});
