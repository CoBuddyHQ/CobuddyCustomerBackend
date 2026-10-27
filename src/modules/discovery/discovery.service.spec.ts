import { DiscoveryService } from './discovery.service';
import { BookingService } from '../booking/booking.service';
import { SystemController } from '../system/system.controller';

describe('DiscoveryService activity booking contract', () => {
  it('offers the configured activities without publishing placeholder hourly prices', () => {
    const discovery = new DiscoveryService({} as never, {} as never);
    const configured = new SystemController().getMasterData().activityCategories;
    const activities = discovery.getActivities();

    expect(activities.length).toBeGreaterThan(0);
    expect(activities.map(({ id }) => id)).toEqual(configured.map(({ id }) => id));
    expect(new Set(activities.map(({ id }) => id)).size).toBe(activities.length);
    for (const activity of activities) {
      expect(activity.defaultTitle).toBeTruthy();
      expect(activity).not.toHaveProperty('price');
    }
  });

  it('can quote every offered activity using the configured multiplier and Companion rate', async () => {
    const companionClient = {
      getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }),
    };
    const discovery = new DiscoveryService({} as never, companionClient as never);
    const booking = new BookingService({} as never, companionClient as never);
    const configured = new SystemController().getMasterData().activityCategories;

    for (const activity of discovery.getActivities()) {
      const category = configured.find(({ id }) => id === activity.id)!;
      await expect(booking.getBookingQuote({
        companionId: 'companion-1',
        activityId: activity.id,
        durationHours: 2,
      })).resolves.toMatchObject({
        currency: 'INR',
        baseRate: 1200 * category.multiplier,
        baseTotal: 2400 * category.multiplier,
      });
    }
    expect(companionClient.getCompanionById).toHaveBeenCalledTimes(configured.length);
  });
});

describe('DiscoveryService campaign audience', () => {
  it('uses only the authenticated customer profile city for city eligibility', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ city: 'Pune' }) },
    };
    const companionClient = {
      getCampaigns: jest
        .fn()
        .mockResolvedValue({ success: true, campaigns: [] }),
    };
    const service = new DiscoveryService(
      prisma as never,
      companionClient as never,
    );

    await service.getCampaigns('customer-1');
    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      select: { city: true },
    });
    expect(companionClient.getCampaigns).toHaveBeenCalledWith('Pune');
  });

  it('does not accept or infer a city for guests or missing customer profiles', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const companionClient = {
      getCampaigns: jest
        .fn()
        .mockResolvedValue({ success: true, campaigns: [] }),
    };
    const service = new DiscoveryService(
      prisma as never,
      companionClient as never,
    );

    await service.getCampaigns();
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    expect(companionClient.getCampaigns).toHaveBeenCalledWith(undefined);

    await service.getCampaigns('customer-without-profile-city');
    expect(companionClient.getCampaigns).toHaveBeenLastCalledWith(undefined);
  });
});
