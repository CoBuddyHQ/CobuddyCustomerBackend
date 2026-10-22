import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CompanionClientService } from './companion-client.service';

describe('CompanionClientService campaigns', () => {
  const previousAdminApiUrl = process.env.ADMIN_API_URL;
  const previousInternalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const service = new CompanionClientService();

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousAdminApiUrl === undefined) delete process.env.ADMIN_API_URL;
    else process.env.ADMIN_API_URL = previousAdminApiUrl;
    if (previousInternalSecret === undefined)
      delete process.env.INTERNAL_SERVICE_SECRET;
    else process.env.INTERNAL_SERVICE_SECRET = previousInternalSecret;
  });

  it('reads the Admin announcement source and filters to active customer audiences', async () => {
    process.env.ADMIN_API_URL = 'https://admin.example.test/';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'active',
            title: 'Offer',
            message: 'Published',
            category: 'PROMOTION',
            targetAudience: 'ALL',
            isPublished: true,
            publishedAt: new Date(Date.now() - 60_000).toISOString(),
          },
          {
            id: 'companion-only',
            targetAudience: 'COMPANIONS',
            isPublished: true,
            publishedAt: new Date(Date.now() - 60_000).toISOString(),
          },
          {
            id: 'scheduled',
            targetAudience: 'CUSTOMERS',
            isPublished: true,
            publishedAt: new Date(Date.now() - 60_000).toISOString(),
            scheduledFor: new Date(Date.now() + 60_000).toISOString(),
          },
          {
            id: 'draft',
            title: 'Draft offer',
            message: 'Not published',
            targetAudience: 'CUSTOMERS',
            isPublished: false,
            publishedAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      }),
    } as Response);

    await expect(service.getCampaigns()).resolves.toEqual({
      success: true,
      campaigns: [
        {
          id: 'active',
          title: 'Offer',
          message: 'Published',
          category: 'PROMOTION',
          publishedAt: expect.any(String),
          expiresAt: null,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://admin.example.test/api/internal/announcements/customers/active',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Internal-Service-Key': 'test-internal-secret-token',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('surfaces unavailable Admin campaigns instead of returning an empty success', async () => {
    process.env.ADMIN_API_URL = 'https://admin.example.test';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network unavailable'));
    await expect(service.getCampaigns()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('requests city eligibility only with the stored server-side city and filters other cities', async () => {
    process.env.ADMIN_API_URL = 'https://admin.example.test';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'pune-offer',
            title: 'Pune Offer',
            message: 'Only for Pune',
            targetAudience: 'CITY_SPECIFIC',
            targetCity: 'Pune',
            isPublished: true,
            publishedAt: new Date(Date.now() - 60_000).toISOString(),
          },
          {
            id: 'mumbai-offer',
            title: 'Mumbai Offer',
            message: 'Only for Mumbai',
            targetAudience: 'CITY_SPECIFIC',
            targetCity: 'Mumbai',
            isPublished: true,
            publishedAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      }),
    } as Response);

    await expect(service.getCampaigns('Pune')).resolves.toMatchObject({
      campaigns: [{ id: 'pune-offer', title: 'Pune Offer' }],
    });
    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).searchParams.get('city')).toBe('Pune');
    expect(init?.headers).toEqual(
      expect.objectContaining({
        'X-Internal-Service-Key': 'test-internal-secret-token',
      }),
    );
  });
});

describe('CompanionClientService private companion contract', () => {
  const service = new CompanionClientService();
  const previousUrl = process.env.COMPANION_API_URL;
  const previousSecret = process.env.INTERNAL_SERVICE_SECRET;

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousUrl === undefined) delete process.env.COMPANION_API_URL;
    else process.env.COMPANION_API_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.INTERNAL_SERVICE_SECRET;
    else process.env.INTERNAL_SERVICE_SECRET = previousSecret;
  });

  it('does not fall back to an unauthenticated public endpoint when the S2S route is missing', async () => {
    process.env.COMPANION_API_URL = 'https://companion.example.test';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(
      service.getCompanionById('companion-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://companion.example.test/api/v1/internal/companions/companion-1',
      expect.objectContaining({
        headers: expect.any(Object),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('sends booking modifications through the authenticated internal request API', async () => {
    process.env.COMPANION_API_URL = 'https://companion.example.test/';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await expect(
      service.modifyBookingRequest('booking/1', {
        venueName: 'New venue',
        durationMinutes: 120,
      }),
    ).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://companion.example.test/api/v1/internal/companion/requests/booking%2F1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'X-Internal-Service-Key': 'test-internal-secret-token',
        }),
        signal: expect.any(AbortSignal),
        redirect: 'error',
      }),
    );
  });

  it('reports a booking modification conflict without accepting upstream error details', async () => {
    process.env.COMPANION_API_URL = 'https://companion.example.test';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 409 } as Response);

    await expect(
      service.modifyBookingRequest('booking-1', { venueName: 'New venue' }),
    ).rejects.toThrow('already accepted or closed');
  });
});
