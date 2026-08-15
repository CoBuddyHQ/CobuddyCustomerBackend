import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBookingDto,
  CancelBookingDto,
  DisputeBookingDto,
  ModifyBookingDto,
  CounterOfferResponseDto,
} from './dto/booking.dto';

const PLATFORM_FEE_PERCENT = 0.05; // 5%
const TAX_PERCENT = 0.018; // 1.8% GST approximation

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(private prisma: PrismaService) {}

  // ── CREATE BOOKING REQUEST ────────────────────────────────────────────────
  async createBooking(customerId: string, dto: CreateBookingDto) {
    // Server-side pricing calculation — never trust frontend amount
    const baseTotal = dto.baseRate * dto.durationHours;
    const platformFee = Math.round(baseTotal * PLATFORM_FEE_PERCENT);
    const taxAmount = Math.round(baseTotal * TAX_PERCENT);
    const totalAmount = baseTotal + platformFee + taxAmount;

    const booking = await this.prisma.customerBooking.create({
      data: {
        customerId,
        companionId: dto.companionId,
        companionName: dto.companionName,
        activityId: dto.activityId,
        activityName: dto.activityName,
        activityIcon: dto.activityIcon,
        venueName: dto.venueName,
        venueAddress: dto.venueAddress,
        date: new Date(dto.date),
        time: dto.time,
        durationHours: dto.durationHours,
        specialInstructions: dto.specialInstructions,
        baseRate: dto.baseRate,
        baseTotal,
        platformFee,
        taxAmount,
        totalAmount,
        status: 'pending',
      },
    });

    // Create notification
    await this.prisma.customerNotification.create({
      data: {
        customerId,
        title: 'Booking Request Sent',
        description: `Your request to ${dto.companionName || 'companion'} has been sent.`,
        category: 'Bookings',
        icon: 'calendar-clock',
        iconColor: '#D4AF37',
        route: 'BookingDetailScreen',
        stack: 'BookingsTab',
      },
    });

    return this.buildBookingResponse(booking);
  }

  // ── LIST BOOKINGS ─────────────────────────────────────────────────────────
  async listBookings(customerId: string, filter?: string) {
    const where: any = { customerId };

    if (filter === 'pending') {
      where.status = { in: ['pending', 'counter_proposed'] };
    } else if (filter === 'accepted') {
      where.status = { in: ['accepted', 'confirmed', 'in_progress'] };
    } else if (filter === 'history') {
      where.status = { in: ['completed', 'declined', 'cancelled', 'expired', 'refunded'] };
    }

    const bookings = await this.prisma.customerBooking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map(this.buildBookingResponse);
  }

  // ── GET BOOKING DETAIL ────────────────────────────────────────────────────
  async getBooking(customerId: string, bookingId: string) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
      include: { sessions: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.buildBookingResponse(booking);
  }

  // ── CANCEL BOOKING ────────────────────────────────────────────────────────
  async cancelBooking(customerId: string, bookingId: string, dto: CancelBookingDto) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const cancellableStatuses = ['pending', 'counter_proposed', 'accepted', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel a booking with status: ${booking.status}`);
    }

    const updated = await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelReason: dto.reason,
        cancelledAt: new Date(),
      },
    });

    return this.buildBookingResponse(updated);
  }

  // ── MODIFY BOOKING ────────────────────────────────────────────────────────
  async modifyBooking(customerId: string, bookingId: string, dto: ModifyBookingDto) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (!['pending', 'counter_proposed'].includes(booking.status)) {
      throw new BadRequestException('Can only modify a pending or counter-proposed booking');
    }

    const updated = await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: {
        ...(dto.date && { date: new Date(dto.date) }),
        ...(dto.time && { time: dto.time }),
        ...(dto.venueName && { venueName: dto.venueName }),
        ...(dto.durationHours && { durationHours: dto.durationHours }),
        ...(dto.specialInstructions !== undefined && { specialInstructions: dto.specialInstructions }),
      },
    });

    return this.buildBookingResponse(updated);
  }

  // ── ACCEPT COUNTER OFFER ──────────────────────────────────────────────────
  async respondToCounterOffer(customerId: string, bookingId: string, dto: CounterOfferResponseDto) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId, status: 'counter_proposed' },
    });
    if (!booking) throw new NotFoundException('Counter offer not found');

    const newStatus = dto.action === 'accept' ? 'accepted' : 'declined';

    const updated = await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: { status: newStatus as any },
    });

    return this.buildBookingResponse(updated);
  }

  // ── DISPUTE BOOKING ───────────────────────────────────────────────────────
  async disputeBooking(customerId: string, bookingId: string, dto: DisputeBookingDto) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    await this.prisma.customerDispute.create({
      data: {
        bookingId,
        customerId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: { status: 'disputed' },
    });

    return { message: 'Dispute filed successfully. Our team will review within 24-48 hours.' };
  }

  // ── HELPER ────────────────────────────────────────────────────────────────
  private buildBookingResponse(booking: any) {
    return {
      id: booking.id,
      bookingRef: booking.bookingRef,
      companionId: booking.companionId,
      companionName: booking.companionName,
      activityId: booking.activityId,
      activityName: booking.activityName,
      activityIcon: booking.activityIcon,
      venueName: booking.venueName,
      venueAddress: booking.venueAddress,
      date: booking.date,
      time: booking.time,
      durationHours: booking.durationHours,
      specialInstructions: booking.specialInstructions,
      status: booking.status,
      pricing: {
        baseRate: booking.baseRate,
        durationHours: booking.durationHours,
        baseTotal: booking.baseTotal,
        platformFee: booking.platformFee,
        taxAmount: booking.taxAmount,
        totalAmount: booking.totalAmount,
        formatted: {
          baseTotal: `₹${booking.baseTotal.toLocaleString('en-IN')}`,
          platformFee: `₹${booking.platformFee.toLocaleString('en-IN')}`,
          taxAmount: `₹${booking.taxAmount.toLocaleString('en-IN')}`,
          totalAmount: `₹${booking.totalAmount.toLocaleString('en-IN')}`,
        },
      },
      counterOffer: booking.counterDate ? {
        date: booking.counterDate,
        time: booking.counterTime,
        venueName: booking.counterVenueName,
        durationHours: booking.counterDurationHours,
        totalAmount: booking.counterTotalAmount,
        message: booking.counterMessage,
      } : null,
      cancelReason: booking.cancelReason,
      declineReason: booking.declineReason,
      paymentStatus: booking.paymentStatus,
      requestedAt: booking.requestedAt,
      acceptedAt: booking.acceptedAt,
      cancelledAt: booking.cancelledAt,
      completedAt: booking.completedAt,
      createdAt: booking.createdAt,
    };
  }
}
