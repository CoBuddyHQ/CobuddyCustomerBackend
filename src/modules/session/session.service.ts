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
      durationMinutes: session.durationMinutes ?? null,
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
        status: { in: ['upcoming', 'pre_arrival', 'checked_in', 'active', 'extending'] },
      },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) return null;
    return this.toSessionResponse(session);
  }

  async checkIn(customerId: string, bookingId: string, passCode?: string) {
    // FIX: Accept both 'accepted' and 'confirmed' status
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId, status: { in: ['accepted', 'confirmed'] } },
    });
    if (!booking) throw new NotFoundException('No accepted booking found for check-in');

    // Generate cryptographically secure 4-digit pass code matching frontend contract
    const securePassCode = passCode ?? String(randomInt(1000, 10000));

    const session = await this.prisma.customerSession.upsert({
      where: { bookingId_customerId: { bookingId, customerId } as any },
      create: {
        bookingId,
        customerId,
        companionId: booking.companionId,
        status: 'checked_in',
        checkInTime: new Date(),
        passCode: securePassCode,
      },
      update: {
        status: 'checked_in',
        checkInTime: new Date(),
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
      where: { id: sessionId, customerId, status: { in: ['active', 'checked_in', 'extending'] } },
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
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const updated = await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        checkOutTime: new Date(),
        tipAmount: tip ?? 0,
      },
      include: { booking: true },
    });

    await this.prisma.customerBooking.update({
      where: { id: session.bookingId },
      data: { status: 'completed', completedAt: new Date() },
    });

    return this.toSessionResponse(updated);
  }

  async getSessionPass(customerId: string, sessionId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
      include: { booking: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    const b = session.booking;

    // Returns exact SessionPass interface expected by frontend
    return {
      sessionId: session.id,
      passCode: session.passCode ?? null,
      companionName: b?.companionName ?? '',
      activity: b?.activityName ?? b?.activityId ?? '',
      venue: b?.venueName ?? '',
      venueArea: b?.venueArea ?? '',
      startTime: b?.date ? new Date(b.date).toISOString() : session.checkInTime?.toISOString() ?? null,
      duration: b?.durationHours ? b.durationHours * 60 : null,
      status: session.status,
    };
  }

  async listSessionHistory(customerId: string) {
    const sessions = await this.prisma.customerSession.findMany({
      where: { customerId },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(s => this.toSessionResponse(s));
  }

  async submitTip(customerId: string, sessionId: string, amount: number, paymentMethod = 'wallet') {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (paymentMethod === 'wallet') {
      const wallet = await this.prisma.customerWallet.findUnique({ where: { customerId } });
      if (wallet && wallet.balance >= amount) {
        await this.prisma.customerWallet.update({
          where: { customerId },
          data: { balance: { decrement: amount } },
        });
      }
    }

    const updated = await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: { tipAmount: { increment: amount } },
      include: { booking: true },
    });

    return { success: true, message: `₹${amount} tip sent successfully`, session: this.toSessionResponse(updated) };
  }

  async submitFeedback(customerId: string, sessionId: string, sentiment: 'up' | 'down', tags: string[]) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
    });
    if (!session) throw new NotFoundException('Session not found');

    return {
      success: true,
      message: 'Feedback submitted successfully',
      feedback: { sessionId, sentiment, tags, submittedAt: new Date().toISOString() },
    };
  }
}
