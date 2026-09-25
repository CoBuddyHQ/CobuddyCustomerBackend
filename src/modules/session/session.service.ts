import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomInt } from 'crypto';

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  // Maps raw session to the frontend Session interface
  private toSessionResponse(session: any) {
    return {
      id: session.id,
      bookingId: session.bookingId,
      companionId: session.companionId,
      customerId: session.customerId,
      status: session.status,
      startedAt: session.checkInTime?.toISOString() ?? null,
      endedAt: session.checkOutTime?.toISOString() ?? null,
      durationMinutes: session.totalMinutes ?? (session.booking?.durationHours ? Math.round(Number(session.booking.durationHours) * 60) : 60),
      extensionMinutes: session.extensionMinutes ?? 0,
      passCode: session.passCode ?? null,
      checkedIn: ['checked_in', 'active', 'extending', 'completed'].includes(session.status),
      tipAmount: session.tipAmount ?? 0,
      createdAt: session.createdAt?.toISOString(),
      booking: session.booking ?? null,
    };
  }

  async getCurrentSession(customerId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: {
        customerId,
        status: { in: ['upcoming', 'pre_arrival', 'checked_in', 'active', 'extending'] as any },
      },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) return null;
    return this.toSessionResponse(session);
  }

  async checkIn(customerId: string, bookingId: string) {
    // Accept both 'accepted' and 'confirmed' status
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId, status: { in: ['accepted', 'confirmed'] } },
    });
    if (!booking) throw new NotFoundException('No accepted booking found for check-in');

    // SECURITY: passCode is ALWAYS server-generated — never accept from client
    const securePassCode = String(randomInt(1000, 10000));

    const durationMins = Math.round(Number(booking.durationHours || 1) * 60);

    const session = await this.prisma.customerSession.upsert({
      where: { bookingId_customerId: { bookingId, customerId } as any },
      create: {
        bookingId,
        customerId,
        companionId: booking.companionId,
        status: 'checked_in',
        checkInTime: new Date(),
        passCode: securePassCode,
        totalMinutes: durationMins,
      },
      update: {
        status: 'checked_in',
        checkInTime: new Date(),
        totalMinutes: durationMins,
      },
      include: { booking: true },
    });

    await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: { status: 'in_progress' },
    });

    return this.toSessionResponse(session);
  }

  async extendSession(customerId: string, sessionId: string, extraMinutes: number) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId, status: { in: ['active', 'checked_in', 'extending'] as any } },
    });
    if (!session) throw new NotFoundException('Active session not found');

    const updated = await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: { extensionMinutes: { increment: extraMinutes } },
      include: { booking: true },
    });
    return this.toSessionResponse(updated);
  }

  async endSession(customerId: string, sessionId: string, tip?: number) {
    const ACTIVE_STATUSES = ['checked_in', 'active', 'extending'];
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId, status: { in: ACTIVE_STATUSES as any } },
    });
    if (!session) throw new NotFoundException('No active session found to end');

    const updated = await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        checkOutTime: new Date(),
        tipAmount: tip ?? 0,
      },
      include: { booking: true },
    });

    // Update booking status to completed
    if (session.bookingId) {
      await this.prisma.customerBooking.update({
        where: { id: session.bookingId },
        data: { status: 'completed', completedAt: new Date() },
      });
    }

    return this.toSessionResponse(updated);
  }

  async listSessionHistory(customerId: string) {
    const sessions = await this.prisma.customerSession.findMany({
      where: { customerId },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(s => this.toSessionResponse(s));
  }

  async getSessionPass(customerId: string, sessionId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
      include: { booking: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    return {
      passCode: session.passCode,
      status: session.status,
      bookingRef: session.booking?.bookingRef,
      companionName: session.booking?.companionName,
      venueName: session.booking?.venueName,
      scheduledTime: session.booking?.time,
    };
  }

  async submitTip(customerId: string, sessionId: string, amount: number, paymentMethod?: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const updated = await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: { tipAmount: { increment: amount } },
    });

    await this.prisma.customerTransaction.create({
      data: {
        customerId,
        bookingId: session.bookingId,
        type: 'tip',
        amount,
        description: `Tip for companion`,
        paymentSource: paymentMethod ?? 'wallet',
        status: 'completed',
      },
    });

    return { message: 'Tip added successfully', tipAmount: updated.tipAmount };
  }

  async submitFeedback(customerId: string, sessionId: string, sentiment: 'up' | 'down', tags: string[]) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.customerSessionFeedback.upsert({
      where: { sessionId },
      update: { sentiment, tags },
      create: {
        sessionId,
        customerId,
        sentiment,
        tags,
      },
    });

    return { message: 'Feedback submitted successfully' };
  }
}
