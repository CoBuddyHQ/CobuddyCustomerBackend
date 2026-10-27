import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BookingService } from './booking.service';

describe('BookingService authoritative pricing', () => {
  it('quotes from the Companion Backend rate rather than a client price', async () => {
    const companionClient = {
      getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }),
    };
    const service = new BookingService({} as any, companionClient as any);
    await expect(
      service.getBookingQuote({
        companionId: 'companion-1',
        activityId: 'INT-1',
        durationHours: 2,
      }),
    ).resolves.toMatchObject({
      currency: 'INR',
      baseRate: 1200,
      baseTotal: 2400,
      platformFee: 360,
      taxAmount: 432,
      totalAmount: 3192,
    });
  });

  it('does not fall back to a client-supplied rate when Companion pricing is unavailable', async () => {
    const prisma = {
      customerBooking: { findFirst: jest.fn(), create: jest.fn() },
    };
    const companionClient = {
      getCompanionById: jest
        .fn()
        .mockRejectedValue(new Error('upstream unavailable')),
    };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(
      service.createBooking('customer-1', {
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
      } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(companionClient.getCompanionById).toHaveBeenCalledWith(
      'companion-1',
    );
    expect(prisma.customerBooking.create).not.toHaveBeenCalled();
  });

  it('blocks booking when the companion has no published positive rate', async () => {
    const prisma = {
      customerBooking: { findFirst: jest.fn(), create: jest.fn() },
    };
    const companionClient = {
      getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 0 }),
    };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(
      service.createBooking('customer-1', {
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
      } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerBooking.create).not.toHaveBeenCalled();
  });

  it('returns a false dispatch result when Companion Backend does not accept a booking request', async () => {
    const prisma = {
      customer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'Test Customer', kycStatus: 'verified' }),
      },
    };
    const companionClient = {
      createBookingRequest: jest
        .fn()
        .mockRejectedValue(new Error('upstream unavailable')),
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

    await expect(
      (service as any).notifyCompanionBackendOfNewBooking(
        booking,
        'customer-1',
      ),
    ).resolves.toBe(false);
    expect(companionClient.createBookingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        customerSafetyConsent: true,
        customerVerified: true,
        estimatedEarning: 1200,
      }),
    );
  });

  it('rejects a client request that does not acknowledge safety', async () => {
    const companionClient = { getCompanionById: jest.fn() };
    const service = new BookingService({} as any, companionClient as any);

    await expect(
      service.createBooking('customer-1', {
        companionId: 'companion-1',
        activityId: 'INT-1',
        activityName: 'Coffee Meetup',
        venueName: 'Customer selected venue',
        time: '10:00 AM',
        scheduledStart: '2026-10-20T10:00:00.000Z',
        safetyAcknowledged: false,
        durationHours: 1,
      } as any),
    ).rejects.toThrow('Safety agreement must be acknowledged');
    expect(companionClient.getCompanionById).not.toHaveBeenCalled();
  });

  it('rejects inconsistent local date, time, timezone, and scheduled timestamp values', async () => {
    const companionClient = {
      getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }),
    };
    const prisma = {
      customerBooking: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(
      service.createBooking('customer-1', {
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
      } as any),
    ).rejects.toThrow('does not match the selected local date and time');
    expect(prisma.customerBooking.findFirst).not.toHaveBeenCalled();
  });

  it('rejects unsupported activity IDs instead of applying the default multiplier', async () => {
    const companionClient = { getCompanionById: jest.fn() };
    const service = new BookingService({} as any, companionClient as any);

    await expect(
      service.getBookingQuote({
        companionId: 'companion-1',
        activityId: 'unknown-activity',
        durationHours: 1,
      }),
    ).rejects.toThrow('A supported activity is required');
    expect(companionClient.getCompanionById).not.toHaveBeenCalled();
  });

  it('does not cancel a paid booking or create a fake wallet refund when provider refunds are unavailable', async () => {
    const prisma = {
      customerBooking: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'booking-1',
          customerId: 'customer-1',
          status: 'confirmed',
          paymentStatus: 'completed',
          date: new Date(Date.now() + 72 * 60 * 60 * 1000),
          totalAmount: 100,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const service = new BookingService(prisma as any, undefined);

    await expect(
      service.cancelBooking('customer-1', 'booking-1', {
        reason: 'Changed plans',
      } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerBooking.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns zero refund on cancellation when the booking has never been paid', async () => {
    const booking = {
      id: 'booking-unpaid', customerId: 'customer-1', status: 'accepted',
      paymentStatus: 'pending', date: new Date(Date.now() + 72 * 60 * 60 * 1000),
      totalAmount: 100, baseRate: 100, durationHours: 1, durationMultiplier: 1,
      baseTotal: 100, platformFee: 0, taxAmount: 0, companionId: 'companion-1',
      activityName: 'Activity', venueName: 'Venue', time: '10:00 AM',
    };
    const prisma = { customerBooking: {
      findFirst: jest.fn().mockResolvedValue(booking),
      update: jest.fn().mockResolvedValue({ ...booking, status: 'cancelled' }),
    } };
    const service = new BookingService(prisma as any, undefined);

    await expect(service.cancelBooking('customer-1', 'booking-unpaid', { reason: 'Changed plans' } as any))
      .resolves.toMatchObject({
        status: 'cancelled',
        cancellationSummary: { refundPercent: 0, refundAmount: 0 },
      });
  });

  it('synchronizes a modified booking schedule and server-recalculated price to Companion', async () => {
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      companionId: 'companion-1',
      activityId: 'INT-1',
      activityName: 'Coffee Meetup',
      status: 'pending',
      paymentStatus: 'pending',
      date: new Date('2026-10-20T10:00:00.000Z'),
      time: '10:00 AM',
      durationHours: 1,
      venueName: 'Old Venue',
      venueArea: 'Area',
      venueCity: 'Pune',
      venueType: 'PUBLIC',
      meetingPoint: null,
      landmark: null,
      specialInstructions: null,
      baseRate: 1200,
      durationMultiplier: 1,
      baseTotal: 1200,
      platformFee: 180,
      taxAmount: 216,
      totalAmount: 1596,
    };
    const prisma = {
      customerBooking: {
        findFirst: jest.fn().mockResolvedValue(booking),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...booking, ...data }),
          ),
      },
    };
    const companionClient = {
      getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }),
      modifyBookingRequest: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new BookingService(prisma as any, companionClient as any);
    const scheduledStart = '2026-10-20T12:00:00.000Z';

    const response = await service.modifyBooking('customer-1', 'booking-1', {
      date: '2026-10-20',
      time: '12:00 PM',
      timeZone: 'UTC',
      scheduledStart,
      durationHours: 2,
      venueName: 'New Venue',
    });

    expect(companionClient.modifyBookingRequest).toHaveBeenCalledWith(
      'booking-1',
      expect.objectContaining({
        proposedStart: scheduledStart,
        proposedEnd: '2026-10-20T14:00:00.000Z',
        durationMinutes: 120,
        venueName: 'New Venue',
        estimatedEarning: '2400',
      }),
    );
    expect(prisma.customerBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          date: new Date(scheduledStart),
          durationHours: 2,
          baseTotal: 2400,
          totalAmount: 3192,
        }),
      }),
    );
    expect(response.date).toEqual(new Date(scheduledStart));
  });

  it('rolls back the local booking and reports failure when Companion rejects a modification', async () => {
    const original = {
      id: 'booking-1',
      customerId: 'customer-1',
      companionId: 'companion-1',
      activityId: 'INT-1',
      status: 'pending',
      paymentStatus: 'pending',
      date: new Date('2026-10-20T10:00:00.000Z'),
      time: '10:00 AM',
      durationHours: 1,
      venueName: 'Old Venue',
      specialInstructions: null,
      baseRate: 1200,
      durationMultiplier: 1,
      baseTotal: 1200,
      platformFee: 180,
      taxAmount: 216,
      totalAmount: 1596,
    };
    const prisma = {
      customerBooking: {
        findFirst: jest.fn().mockResolvedValue(original),
        update: jest.fn().mockResolvedValue(original),
      },
    };
    const companionClient = {
      getCompanionById: jest.fn().mockResolvedValue({ hourlyRate: 1200 }),
      modifyBookingRequest: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('upstream unavailable'),
        ),
    };
    const service = new BookingService(prisma as any, companionClient as any);

    await expect(
      service.modifyBooking('customer-1', 'booking-1', {
        venueName: 'New Venue',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerBooking.update).toHaveBeenCalledTimes(2);
    expect(prisma.customerBooking.update.mock.calls[1][0].data).toMatchObject({
      venueName: 'Old Venue',
      date: original.date,
      totalAmount: 1596,
    });
  });
});

describe('BookingService accepted session pass synchronization', () => {
  it('does not mark a customer booking accepted without the Companion-issued pass', async () => {
    const prisma = {
      customerBooking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'booking-1', customerId: 'customer-1', companionId: 'companion-1', sessions: [],
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new BookingService(prisma as any);

    await expect(service.handleInternalStatusUpdate('booking-1', { status: 'accepted' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
