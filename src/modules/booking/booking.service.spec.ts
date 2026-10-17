import { ServiceUnavailableException } from '@nestjs/common';
import { BookingService } from './booking.service';

describe('BookingService authoritative pricing', () => {
  it('quotes from the Companion Backend rate rather than a client price', async () => {
    const companionClient = { getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }) };
    const service = new BookingService({} as any, companionClient as any);
    await expect(service.getBookingQuote({
      companionId: 'companion-1',
      activityId: 'INT-1',
      durationHours: 2,
    })).resolves.toMatchObject({
      currency: 'INR',
      baseRate: 1200,
      baseTotal: 2400,
      platformFee: 360,
      taxAmount: 432,
      totalAmount: 3192,
    });
  });

  it('does not fall back to a client-supplied rate when Companion pricing is unavailable', async () => {
    const prisma = { customerBooking: { findFirst: jest.fn(), create: jest.fn() } };
    const companionClient = {
      getCompanionById: jest.fn().mockRejectedValue(new Error('upstream unavailable')),
    };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(service.createBooking('customer-1', {
      companionId: 'companion-1',
      baseRate: 999999,
      activityId: 'INT-1',
      activityName: 'Coffee Meetup',
      venueName: 'Customer selected venue',
      date: '2026-10-20T00:00:00.000Z',
      time: '10:00 AM',
      timeZone: 'UTC',
      scheduledStart: '2026-10-20T10:00:00.000Z',
      safetyAcknowledged: true,
      durationHours: 1,
    } as any)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(companionClient.getCompanionById).toHaveBeenCalledWith('companion-1');
    expect(prisma.customerBooking.create).not.toHaveBeenCalled();
  });

  it('blocks booking when the companion has no published positive rate', async () => {
    const prisma = { customerBooking: { findFirst: jest.fn(), create: jest.fn() } };
    const companionClient = { getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 0 }) };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(service.createBooking('customer-1', {
      companionId: 'companion-1',
      baseRate: 500,
      activityId: 'INT-1',
      activityName: 'Coffee Meetup',
      venueName: 'Customer selected venue',
      date: '2026-10-20T00:00:00.000Z',
      time: '10:00 AM',
      timeZone: 'UTC',
      scheduledStart: '2026-10-20T10:00:00.000Z',
      safetyAcknowledged: true,
      durationHours: 1,
    } as any)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerBooking.create).not.toHaveBeenCalled();
  });

  it('returns a false dispatch result when Companion Backend does not accept a booking request', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Customer', kycStatus: 'verified' }) },
    };
    const companionClient = {
      createBookingRequest: jest.fn().mockRejectedValue(new Error('upstream unavailable')),
    };
    const service = new BookingService(prisma as any, companionClient as any);
    const booking = {
      id: 'booking-1',
      companionId: 'companion-1',
      date: new Date('2026-10-20T10:00:00.000Z'),
      durationHours: 1,
      activityName: 'Activity',
      venueName: 'Venue',
      safetyAcknowledged: true,
      baseTotal: 1200,
    };

    await expect((service as any).notifyCompanionBackendOfNewBooking(booking, 'customer-1'))
      .resolves.toBe(false);
    expect(companionClient.createBookingRequest).toHaveBeenCalledWith(expect.objectContaining({
      customerSafetyConsent: true,
      customerVerified: true,
      estimatedEarning: 1200,
    }));
  });

  it('rejects a client request that does not acknowledge safety', async () => {
    const companionClient = { getCompanionById: jest.fn() };
    const service = new BookingService({} as any, companionClient as any);

    await expect(service.createBooking('customer-1', {
      companionId: 'companion-1',
      activityId: 'INT-1',
      activityName: 'Coffee Meetup',
      venueName: 'Customer selected venue',
      time: '10:00 AM',
      scheduledStart: '2026-10-20T10:00:00.000Z',
      safetyAcknowledged: false,
      durationHours: 1,
    } as any)).rejects.toThrow('Safety agreement must be acknowledged');
    expect(companionClient.getCompanionById).not.toHaveBeenCalled();
  });

  it('rejects inconsistent local date, time, timezone, and scheduled timestamp values', async () => {
    const companionClient = { getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }) };
    const prisma = { customerBooking: { findFirst: jest.fn(), create: jest.fn() } };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(service.createBooking('customer-1', {
      companionId: 'companion-1',
      activityId: 'INT-1',
      activityName: 'Coffee Meetup',
      venueName: 'Customer selected venue',
      date: '2026-10-20T00:00:00.000Z',
      time: '11:00 AM',
      timeZone: 'UTC',
      scheduledStart: '2026-10-20T10:00:00.000Z',
      safetyAcknowledged: true,
      durationHours: 1,
    } as any)).rejects.toThrow('does not match the selected local date and time');
    expect(prisma.customerBooking.findFirst).not.toHaveBeenCalled();
  });

  it('rejects unsupported activity IDs instead of applying the default multiplier', async () => {
    const companionClient = { getCompanionById: jest.fn() };
    const service = new BookingService({} as any, companionClient as any);

    await expect(service.getBookingQuote({
      companionId: 'companion-1',
      activityId: 'unknown-activity',
      durationHours: 1,
    })).rejects.toThrow('A supported activity is required');
    expect(companionClient.getCompanionById).not.toHaveBeenCalled();
  });
});
