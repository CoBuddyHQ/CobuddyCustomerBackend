import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanionClientService } from '../companion-client/companion-client.service';

@Injectable()
export class SessionService {
  constructor(
    private prisma: PrismaService,
    @Optional() private companionClient?: CompanionClientService,
  ) {}

  // Maps raw session to the frontend Session interface
  private toSessionResponse(session: any) {
    return {
      id: session.id,
      bookingId: session.bookingId,
      companionId: session.companionId,
      customerId: session.customerId,
      status: session.status,
      startedAt: (session.checkInTime || session.createdAt)?.toISOString() ?? new Date().toISOString(),
      endedAt: session.checkOutTime?.toISOString() ?? null,
      durationMinutes: session.totalMinutes ?? (session.booking?.durationHours ? Math.round(Number(session.booking.durationHours) * 60) : 60),
      extensionMinutes: session.extensionMinutes ?? 0,
      passCode: session.passCode ?? null,
      checkedIn: ['checked_in', 'active', 'extending', 'completed'].includes(session.status),
      tipAmount: session.tipAmount ?? 0,
      companionName: session.booking?.companionName || 'Riya Sharma',
      createdAt: session.createdAt?.toISOString(),
      booking: session.booking ?? null,
    };
  }

  async getCurrentSession(customerId: string) {
    const active = await this.prisma.customerSession.findFirst({
      where: {
        customerId,
        status: { in: ['checked_in', 'active', 'extending'] },
      },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) return null;
    return this.toSessionResponse(active);
  }

  async getSessionForBooking(customerId: string, bookingId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: { customerId, bookingId },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    return session ? this.toSessionResponse(session) : null;
  }

  async getSessionById(customerId: string, sessionId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
      include: { booking: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    return this.toSessionResponse(session);
  }

  async checkIn(customerId: string, bookingId: string) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId, status: { in: ['accepted', 'confirmed', 'in_progress'] } },
    });
    if (!booking) throw new NotFoundException('No accepted booking found for check-in');

    const durationMins = Math.round(Number(booking.durationHours || 1) * 60);
    const session = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerSession.findUnique({
        where: { bookingId_customerId: { bookingId, customerId } as any },
        include: { booking: true },
      });
      if (!existing?.passCode) {
        throw new ServiceUnavailableException(
          'The Companion Backend session pass has not synced yet. Check-in was not recorded.',
        );
      }

      if (['checked_in', 'active', 'extending'].includes(existing.status)) {
        return existing;
      }
      if (!['upcoming', 'pre_arrival'].includes(existing.status)) {
        throw new BadRequestException('This session is not available for check-in.');
      }

      const updated = await tx.customerSession.update({
        where: { id: existing.id },
        data: {
          status: 'checked_in',
          checkInTime: new Date(),
          totalMinutes: durationMins,
        },
        include: { booking: true },
      });
      await tx.customerBooking.update({
        where: { id: bookingId },
        data: { status: 'in_progress' },
      });
      return updated;
    });

    return this.toSessionResponse(session);
  }

  async extendSession(_customerId: string, _sessionId: string, extraMinutes: number) {
    if (!Number.isInteger(extraMinutes) || extraMinutes < 15 || extraMinutes > 180) {
      throw new BadRequestException('Extension duration must be between 15 and 180 minutes.');
    }
    throw new ServiceUnavailableException(
      'Session extensions require Companion approval and confirmed payment processing. No duration change or payment was applied.',
    );
  }

  async endSession(customerId: string, sessionId: string, tip?: number) {
    if (tip !== undefined && tip !== 0) {
      throw new ServiceUnavailableException(
        'Tip payment is not configured. No tip or session status was changed.',
      );
    }

    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
      include: { booking: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'completed') return this.toSessionResponse(session);
    if (!['checked_in', 'active', 'extending'].includes(session.status)) {
      throw new BadRequestException('Only an active session can be ended.');
    }
    if (!session.bookingId || !this.companionClient) {
      throw new ServiceUnavailableException(
        'Companion completion service is unavailable. No session status was changed.',
      );
    }

    // Companion Backend owns the session and must confirm completion first.
    const confirmation = await this.companionClient.completeSession(session.bookingId, {
      notes: 'Ended by customer',
    });
    if (confirmation?.success !== true || confirmation.session?.status !== 'completed') {
      throw new ServiceUnavailableException(
        'Companion Backend did not confirm completion. No customer session status was changed.',
      );
    }

    const completedAt = confirmation.session.checkOutTime
      ? new Date(confirmation.session.checkOutTime)
      : new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.customerSession.update({
        where: { id: session.id },
        data: { status: 'completed', checkOutTime: completedAt, tipAmount: 0 },
        include: { booking: true },
      });
      await tx.customerBooking.update({
        where: { id: session.bookingId! },
        data: { status: 'completed', completedAt },
      });
      await tx.customerNotification.create({
        data: {
          customerId,
          title: 'Session Completed',
          description: `Your session with ${session.booking?.companionName || 'your companion'} has ended.`,
          category: 'session',
          icon: 'star',
          iconColor: '#F39C12',
          route: 'CompanionReviewScreen',
          stack: 'LiveSessionStack',
          routeParams: {
            bookingId: session.bookingId,
            companionId: session.companionId,
            companionName: session.booking?.companionName,
          },
        },
      }).catch(() => {});
      return updatedSession;
    });

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
    void customerId;
    void sessionId;
    void amount;
    void paymentMethod;
    throw new ServiceUnavailableException(
      'Tip payment is not configured. No tip or transaction was recorded.',
    );
  }

  async submitFeedback(customerId: string, sessionId: string, sentiment: 'up' | 'down', tags: string[]) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId, status: 'completed' },
    });
    if (!session) throw new NotFoundException('Completed session not found');

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
