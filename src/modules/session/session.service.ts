import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  async getCurrentSession(customerId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: {
        customerId,
        status: { in: ['upcoming', 'pre_arrival', 'checked_in', 'active'] },
      },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
    return session ?? null;
  }

  async checkIn(customerId: string, bookingId: string, passCode?: string) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId, status: 'confirmed' },
    });
    if (!booking) throw new NotFoundException('No confirmed booking found for check-in');

    // Create or update session
    const session = await this.prisma.customerSession.upsert({
      where: { bookingId_customerId: { bookingId, customerId } as any },
      create: {
        bookingId,
        customerId,
        companionId: booking.companionId,
        status: 'checked_in',
        checkInTime: new Date(),
        passCode: passCode ?? String(Math.floor(100000 + Math.random() * 900000)),
      },
      update: {
        status: 'checked_in',
        checkInTime: new Date(),
      },
    });

    // Update booking status
    await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: { status: 'in_progress' },
    });

    return session;
  }

  async extendSession(customerId: string, sessionId: string, extraMinutes: number) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId, status: { in: ['active', 'checked_in'] } },
    });
    if (!session) throw new NotFoundException('Active session not found');

    return this.prisma.customerSession.update({
      where: { id: sessionId },
      data: { extensionMinutes: { increment: extraMinutes } },
    });
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
    });

    // Update booking to completed
    await this.prisma.customerBooking.update({
      where: { id: session.bookingId },
      data: { status: 'completed', completedAt: new Date() },
    });

    return updated;
  }

  async getSessionPass(customerId: string, sessionId: string) {
    const session = await this.prisma.customerSession.findFirst({
      where: { id: sessionId, customerId },
      include: { booking: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    return {
      passCode: session.passCode,
      companionId: session.companionId,
      booking: session.booking,
    };
  }

  async listSessionHistory(customerId: string) {
    return this.prisma.customerSession.findMany({
      where: { customerId },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
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
    });

    return { success: true, message: `₹${amount} tip sent successfully`, session: updated };
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
