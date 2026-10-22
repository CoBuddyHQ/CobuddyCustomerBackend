import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from './session.service';

describe('SessionService', () => {
  it('keeps an active session current even if another booking was accepted later', async () => {
    const prisma = {
      customerSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'active-session', status: 'active', booking: { durationHours: 2 },
        }),
      },
    };
    const service = new SessionService(prisma as unknown as PrismaService);
    await expect(service.getCurrentSession('customer-1')).resolves.toMatchObject({ id: 'active-session' });
    expect(prisma.customerSession.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.customerSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 'customer-1', status: { in: ['checked_in', 'active', 'extending'] } },
    }));
  });

  it.each([100, -50, Number.NaN])('rejects an unpaid tip through session end (%s)', async (tip) => {
    const prisma = { customerSession: { findFirst: jest.fn() } };
    const service = new SessionService(prisma as unknown as PrismaService);
    await expect(service.endSession('customer-1', 'session-1', tip)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerSession.findFirst).not.toHaveBeenCalled();
  });
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

  it('refuses check-in when the accepted Companion session pass did not sync', async () => {
    const tx = {
      customerSession: { findUnique: jest.fn().mockResolvedValue({ id: 'session-1', status: 'upcoming', passCode: null }) },
      customerBooking: { update: jest.fn() },
    };
    const prisma = {
      customerBooking: { findFirst: jest.fn().mockResolvedValue({ id: 'booking-1', durationHours: 2 }) },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.checkIn('customer-1', 'booking-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tx.customerSession.findUnique).toHaveBeenCalled();
    expect(tx.customerBooking.update).not.toHaveBeenCalled();
  });

  it('reuses the Companion-issued pass and records check-in only after it exists', async () => {
    const existingSession = { id: 'session-1', status: 'upcoming', passCode: 'test-pass-code' };
    const updatedSession = {
      ...existingSession,
      status: 'checked_in',
      checkInTime: new Date('2026-10-20T10:00:00.000Z'),
      booking: { durationHours: 2 },
    };
    const tx = {
      customerSession: {
        findUnique: jest.fn().mockResolvedValue(existingSession),
        update: jest.fn().mockResolvedValue(updatedSession),
      },
      customerBooking: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      customerBooking: { findFirst: jest.fn().mockResolvedValue({ id: 'booking-1', durationHours: 2 }) },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    const result = await service.checkIn('customer-1', 'booking-1');

    expect(result).toMatchObject({ status: 'checked_in', passCode: 'test-pass-code', durationMinutes: 120 });
    expect(tx.customerSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-1' },
      data: expect.not.objectContaining({ passCode: expect.anything() }),
    }));
    expect(tx.customerBooking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'in_progress' },
    });
  });

  it('returns an already checked-in session without changing its pass code', async () => {
    const existingSession = { id: 'session-1', status: 'checked_in', passCode: 'test-pass-code' };
    const tx = {
      customerSession: { findUnique: jest.fn().mockResolvedValue(existingSession), update: jest.fn() },
      customerBooking: { update: jest.fn() },
    };
    const prisma = {
      customerBooking: { findFirst: jest.fn().mockResolvedValue({ id: 'booking-1', durationHours: 1 }) },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    const result = await service.checkIn('customer-1', 'booking-1');

    expect(result.passCode).toBe('test-pass-code');
    expect(tx.customerSession.update).not.toHaveBeenCalled();
    expect(tx.customerBooking.update).not.toHaveBeenCalled();
  });

  it('does not extend the customer session without Companion approval and payment processing', async () => {
    const prisma = {
      customerSession: { findFirst: jest.fn(), update: jest.fn() },
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.extendSession('customer-1', 'session-1', 30))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.customerSession.update).not.toHaveBeenCalled();
  });

  it('does not locally complete a session while Companion Backend owns completion', async () => {
    const prisma = {
      customerSession: { findFirst: jest.fn(), update: jest.fn() },
      customerBooking: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.endSession('customer-1', 'session-1'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.customerSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.customerSession.update).not.toHaveBeenCalled();
    expect(prisma.customerBooking.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow a client supplied tip to create or complete anything', async () => {
    const prisma = {
      customerSession: { findFirst: jest.fn(), update: jest.fn() },
      customerBooking: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.endSession('customer-1', 'session-1', 500))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only records feedback for a completed session owned by the customer', async () => {
    const prisma = {
      customerSession: { findFirst: jest.fn().mockResolvedValue({ id: 'session-1', status: 'completed' }) },
      customerSessionFeedback: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.submitFeedback('customer-1', 'session-1', 'up', ['Punctual']))
      .resolves.toEqual({ message: 'Feedback submitted successfully' });
    expect(prisma.customerSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', customerId: 'customer-1', status: 'completed' },
    });
    expect(prisma.customerSessionFeedback.upsert).toHaveBeenCalled();
  });

  it('does not save feedback before session completion', async () => {
    const prisma = {
      customerSession: { findFirst: jest.fn().mockResolvedValue(null) },
      customerSessionFeedback: { upsert: jest.fn() },
    };
    const service = new SessionService(prisma as unknown as PrismaService);

    await expect(service.submitFeedback('customer-1', 'session-1', 'up', ['Punctual']))
      .rejects.toThrow('Completed session not found');
    expect(prisma.customerSessionFeedback.upsert).not.toHaveBeenCalled();
  });
});
