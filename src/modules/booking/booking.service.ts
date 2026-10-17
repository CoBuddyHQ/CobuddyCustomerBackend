import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanionClientService } from '../companion-client/companion-client.service';
import {
  CreateBookingDto,
  CancelBookingDto,
  DisputeBookingDto,
  ModifyBookingDto,
  CounterOfferResponseDto,
  BookingPriceQuoteDto,
} from './dto/booking.dto';
import { InternalStatusUpdateDto } from './dto/internal-status-update.dto';

const PLATFORM_FEE_PERCENT = 0.15; // 15% matching adminValues.commission.platformFeePercentage
const TAX_PERCENT = 0.18; // 18% GST matching adminValues.commission.taxPercentage

// Authoritative Activity Multipliers
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  'INT-1': 1.0,
  'INT-2': 1.2,
  'INT-3': 1.0,
  'INT-4': 1.0,
  'INT-5': 1.5,
  'INT-6': 1.0,
  'INT-7': 1.2,
  'INT-8': 1.5,
  'INT-9': 1.2,
  'INT-10': 1.5,
  'INT-11': 1.0,
  'INT-12': 1.2,
  'INT-13': 1.0,
};

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private companionClient?: CompanionClientService,
  ) {}

  async getBookingQuote(dto: BookingPriceQuoteDto) {
    return this.calculateAuthoritativePricing(
      dto.companionId,
      dto.activityId,
      Number(dto.durationHours),
    );
  }

  private async calculateAuthoritativePricing(
    companionId: string,
    activityId: string,
    durationHours: number,
  ) {
    if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 8) {
      throw new BadRequestException('Duration must be between 1 and 8 hours.');
    }
    const multiplier = ACTIVITY_MULTIPLIERS[activityId];
    if (multiplier === undefined) {
      throw new BadRequestException('A supported activity is required to calculate booking pricing.');
    }
    if (!this.companionClient) {
      throw new ServiceUnavailableException('Companion pricing is unavailable. No price was quoted.');
    }

    let hourlyRate: number;
    try {
      const companion = await this.companionClient.getCompanionById(companionId);
      hourlyRate = Number(companion?.hourlyRate);
    } catch {
      this.logger.warn('Companion pricing service unavailable; no price was quoted.');
      throw new ServiceUnavailableException('Companion pricing is unavailable. No price was quoted.');
    }
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      throw new ServiceUnavailableException('Companion has no published price. No price was quoted.');
    }

    const baseRate = hourlyRate * multiplier;
    const baseTotal = Math.round(baseRate * durationHours);
    const platformFee = Math.round(baseTotal * PLATFORM_FEE_PERCENT);
    const taxAmount = Math.round(baseTotal * TAX_PERCENT);
    return {
      currency: 'INR',
      durationHours,
      multiplier,
      baseRate,
      baseTotal,
      platformFee,
      taxAmount,
      totalAmount: baseTotal + platformFee + taxAmount,
    };
  }

  // ── CREATE BOOKING REQUEST ────────────────────────────────────────────────
  async createBooking(customerId: string, dto: CreateBookingDto) {
    if (dto.safetyAcknowledged !== true) {
      throw new BadRequestException('Safety agreement must be acknowledged before booking.');
    }
    const actId = dto.activityId;
    const durationHours = Number(dto.durationHours);
    const pricing = await this.calculateAuthoritativePricing(dto.companionId, actId, durationHours);
    const { multiplier, baseRate, baseTotal, platformFee, taxAmount, totalAmount } = pricing;


    const vName = dto.venue?.name || dto.venueName;
    const vArea = dto.venue?.area || '';
    const vCity = dto.venue?.city || '';
    const vType = dto.venue?.venueType || 'UNVERIFIED';
    const vMeeting = dto.venue?.meetingPoint || '';
    const vLandmark = dto.venue?.landmark || '';
    const vApproved = false;
    const vId = undefined;
    const startDate = new Date(dto.scheduledStart);
    if (!Number.isFinite(startDate.getTime())) {
      throw new BadRequestException('A valid scheduled start time is required.');
    }
    this.assertLocalScheduleMatches(startDate, dto.date, dto.time, dto.timeZone);

    const timeStr = dto.time;
    const activityTitle = dto.activityName;

    // Double-booking conflict check — return 409 Conflict if companion already booked for overlapping active session
    const conflictingActiveSession = await this.prisma.customerBooking.findFirst({
      where: {
        companionId: dto.companionId,
        date: startDate,
        time: timeStr,
        status: { in: ['accepted', 'confirmed', 'in_progress'] },
      },
    });

    if (conflictingActiveSession) {
      throw new ConflictException(
        'Companion already has a confirmed session during this time window (409 Conflict)'
      );
    }

    // Idempotency / Double-tap check — if duplicate pending/confirmed booking exists, return it
    const existingDuplicate = await this.prisma.customerBooking.findFirst({
      where: {
        customerId,
        companionId: dto.companionId,
        date: startDate,
        time: timeStr,
        status: { in: ['pending', 'counter_proposed', 'accepted', 'confirmed'] },
      },
    });

    if (existingDuplicate) {
      const companionRequestStatus = await this.notifyCompanionBackendOfNewBooking(existingDuplicate, customerId);
      return {
        ...this.buildBookingResponse(existingDuplicate),
        companionRequestStatus: companionRequestStatus ? 'sent' : 'unavailable',
      };
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerBooking.create({
        data: {
          customerId,
          companionId: dto.companionId,
          companionName: dto.companionName,
          activityId: actId,
          activityName: activityTitle,
          activityIcon: dto.activityIcon,
          venueId: vId,
          venueName: vName,
          venueAddress: dto.venueAddress || `${vName}, ${vArea} ${vCity}`.trim(),
          venueArea: vArea,
          venueCity: vCity,
          venueType: vType,
          safetyAcknowledged: dto.safetyAcknowledged,
          meetingPoint: vMeeting,
          landmark: vLandmark,
          isApproved: vApproved,
          date: startDate,
          time: timeStr,
          durationHours,
          specialInstructions: dto.specialInstructions,
          baseRate,
          durationMultiplier: multiplier,
          baseTotal,
          platformFee,
          taxAmount,
          totalAmount,
          status: 'pending',
        },
      });

      // Create notification
      await tx.customerNotification.create({
        data: {
          customerId,
          title: 'Booking Request Sent',
          description: `Your request to ${dto.companionName || 'companion'} has been sent.`,
          category: 'request',
          icon: 'calendar-clock',
          iconColor: '#D4AF37',
          route: 'BookingDetailScreen',
          stack: 'BookingsTab',
        },
      });

      return created;
    });

    this.logger.log('Booking request and server-calculated price were stored.');

    // Return the dispatch outcome so the app cannot claim the companion received
    // the request when the cross-service call failed.
    const companionRequestStatus = await this.notifyCompanionBackendOfNewBooking(booking, customerId);
    return {
      ...this.buildBookingResponse(booking),
      companionRequestStatus: companionRequestStatus ? 'sent' : 'unavailable',
    };
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
      include: { sessions: true },
      orderBy: { createdAt: 'desc' },
    });

    try {
      const counts = await this.prisma.customerBooking.groupBy({
        by: ['status'],
        where: { customerId },
        _count: { status: true },
      });
      const statusMap: Record<string, number> = {};
      let totalAll = 0;
      for (const c of counts) {
        statusMap[c.status] = c._count.status;
        totalAll += c._count.status;
      }
      const pendingCount = (statusMap['pending'] || 0) + (statusMap['counter_proposed'] || 0);
      const acceptedCount = (statusMap['accepted'] || 0) + (statusMap['confirmed'] || 0) + (statusMap['in_progress'] || 0);
      const completedCount = statusMap['completed'] || 0;
      const cancelledCount = statusMap['cancelled'] || 0;

      this.logger.log(
        `[Customer Bookings] customerId: ${customerId} | Database: customer_bookings | Total: ${totalAll} | Pending: ${pendingCount} | Accepted: ${acceptedCount} | Completed: ${completedCount} | Cancelled: ${cancelledCount} | Filter: ${filter || 'all'} | Returned: ${bookings.length}`
      );
    } catch {
      // Safe fallback if groupBy fails
    }

    return bookings.map(b => this.buildBookingResponse(b));
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

  // ── CANCEL BOOKING (Tiered Refund Calculation) ────────────────────────────
  async cancelBooking(customerId: string, bookingId: string, dto: CancelBookingDto) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const cancellableStatuses = ['pending', 'counter_proposed', 'accepted', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel a booking with status: ${booking.status}`);
    }

    // Calculate hours remaining until booking date
    const now = new Date();
    const bookingTime = new Date(booking.date);
    const diffHours = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundPercent = 100;
    if (diffHours >= 48) {
      refundPercent = 100;
    } else if (diffHours >= 24) {
      refundPercent = 50;
    } else {
      refundPercent = 0;
    }

    const refundAmount = Math.round((booking.totalAmount * refundPercent) / 100);

    const updated = await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelReason: dto.reason,
        cancelledAt: new Date(),
      },
    });

    // Process wallet refund ONLY if booking was actually paid
    const isPaid = (booking.paymentStatus as any) === 'paid' || booking.paymentStatus === 'completed';
    const actualRefundAmount = isPaid ? refundAmount : 0;

    if (actualRefundAmount > 0) {
      await this.prisma.$transaction(async (tx) => {
        // Update wallet balance
        await tx.customerWallet.updateMany({
          where: { customerId },
          data: { balance: { increment: actualRefundAmount } },
        });

        // Create refund transaction record
        await tx.customerTransaction.create({
          data: {
            customerId,
            bookingId,
            type: 'refund',
            amount: actualRefundAmount,
            description: `Refund — Booking Cancelled (${refundPercent}% policy applied)`,
            status: 'completed',
          },
        });

        // Send notification
        await tx.customerNotification.create({
          data: {
            customerId,
            title: `Refund of ₹${actualRefundAmount} Processed`,
            description: `Your ${refundPercent}% refund has been added to your CoBuddy wallet.`,
            category: 'payment',
            icon: 'wallet',
            iconColor: '#27AE60',
          },
        });
      });
    }

    const response = this.buildBookingResponse(updated);
    return {
      ...response,
      cancellationSummary: {
        hoursBeforeStart: Math.round(diffHours),
        refundPercent,
        refundAmount,
        policyApplied: diffHours >= 48 ? '48h+ Tier (100%)' : (diffHours >= 24 ? '24-48h Tier (50%)' : '<24h Tier (0%)'),
      },
    };
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
    const updateData: any = { status: newStatus as any };

    if (dto.action === 'accept') {
      if (booking.counterDate) updateData.date = booking.counterDate;
      if (booking.counterTime) updateData.time = booking.counterTime;
      if (booking.counterVenueName) updateData.venueName = booking.counterVenueName;
      if (booking.counterDurationHours) updateData.durationHours = booking.counterDurationHours;
      if (booking.counterTotalAmount) updateData.totalAmount = booking.counterTotalAmount;
      updateData.acceptedAt = new Date();
    }

    const updated = await this.prisma.customerBooking.update({
      where: { id: bookingId },
      data: updateData,
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

  // ── HELPER: BUILD RICH STRUCTURED RESPONSE ────────────────────────────────
  private buildBookingResponse(booking: any) {
    const startDate = new Date(booking.date);
    const durationMs = (booking.durationHours || 1) * 60 * 60 * 1000;
    const endDate = new Date(startDate.getTime() + durationMs);

    const venueObj = {
      venueId: booking.venueId ?? null,
      name: booking.venueName,
      area: booking.venueArea || '',
      city: booking.venueCity || '',
      isApproved: booking.isApproved ?? false,
      venueType: booking.venueType,
      meetingPoint: booking.meetingPoint,
      landmark: booking.landmark || '',
    };

    const activeSession = booking.sessions?.[0];

    return {
      id: booking.id,
      bookingRef: booking.bookingRef,
      companionId: booking.companionId,
      companionName: booking.companionName,
      activity: booking.activityName,
      activityId: booking.activityId,
      activityName: booking.activityName,
      activityIcon: booking.activityIcon,
      venue: venueObj,
      venueName: booking.venueName,
      venueAddress: booking.venueAddress,
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      date: booking.date,
      time: booking.time,
      durationHours: booking.durationHours,
      specialInstructions: booking.specialInstructions,
      requestStatus: booking.status,
      sessionStatus: activeSession?.status || (booking.status === 'accepted' ? 'upcoming' : undefined),
      status: booking.status,
      sessionPassCode: activeSession?.passCode ?? null,
      matchScore: null,
      safetyTimerActive: false,
      earningsBreakdown: {
        base: booking.baseTotal,
        tip: 0,
        total: booking.totalAmount,
      },
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
      counterOffer: (booking.counterDate || booking.counterTime || booking.counterMessage) ? {
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

  // ── S2S INTERNAL: HANDLE STATUS UPDATE FROM COMPANION BACKEND ─────────────
  async handleInternalStatusUpdate(bookingId: string, dto: InternalStatusUpdateDto) {
    const booking = await this.prisma.customerBooking.findUnique({
      where: { id: bookingId },
      include: { sessions: true },
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    const status = dto.status.toLowerCase();
    const effectivePassCode = dto.sessionPassCode || dto.passCode;
    if (status === 'accepted') {
      await this.prisma.$transaction(async (tx) => {
        await tx.customerBooking.update({
          where: { id: bookingId },
          data: {
            status: 'accepted',
            acceptedAt: new Date(),
          },
        });

        await tx.customerSession.upsert({
          where: {
            bookingId_customerId: {
              bookingId,
              customerId: booking.customerId,
            },
          },
          create: {
            bookingId,
            customerId: booking.customerId,
            companionId: booking.companionId,
            status: 'upcoming',
            passCode: effectivePassCode,
          },
          update: {
            status: 'upcoming',
            passCode: effectivePassCode,
          },
        });

        await tx.customerNotification.create({
          data: {
            customerId: booking.customerId,
            title: 'Booking Accepted! ✓',
            description: `Your booking request has been accepted by ${booking.companionName || 'your companion'}. Session pass code: ${effectivePassCode || 'N/A'}`,
            category: 'booking',
            icon: 'calendar-check',
            iconColor: '#27AE60',
            route: 'ActiveSessionScreen',
            stack: 'BookingsTab',
          },
        });
      });
      this.logger.log(`[S2S] Booking ${bookingId} updated to accepted with pass code ${effectivePassCode}`);
    } else if (status === 'declined') {
      await this.prisma.$transaction(async (tx) => {
        await tx.customerBooking.update({
          where: { id: bookingId },
          data: {
            status: 'declined',
            declineReason: dto.reason || 'Companion was unavailable',
          },
        });

        await tx.customerNotification.create({
          data: {
            customerId: booking.customerId,
            title: 'Booking Request Declined',
            description: `${booking.companionName || 'The companion'} was unable to accept your booking request.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
            category: 'booking',
            icon: 'calendar-remove',
            iconColor: '#E74C3C',
            route: 'BookingDetailScreen',
            stack: 'BookingsTab',
          },
        });
      });
      this.logger.log(`[S2S] Booking ${bookingId} updated to declined (reason: ${dto.reason})`);
    } else if (status === 'counter_proposed') {
      const counterStart = dto.newStart ? new Date(dto.newStart) : undefined;
      await this.prisma.$transaction(async (tx) => {
        await tx.customerBooking.update({
          where: { id: bookingId },
          data: {
            status: 'counter_proposed',
            counterDate: counterStart,
            counterTime: counterStart ? counterStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
            counterMessage: 'Companion proposed an alternative time for this session.',
          },
        });

        await tx.customerNotification.create({
          data: {
            customerId: booking.customerId,
            title: 'New Counter Offer Received',
            description: `${booking.companionName || 'Your companion'} proposed a new time for your booking. Please review.`,
            category: 'booking',
            icon: 'clock-edit',
            iconColor: '#F39C12',
            route: 'BookingDetailScreen',
            stack: 'BookingsTab',
          },
        });
      });
      this.logger.log(`[S2S] Booking ${bookingId} updated to counter_proposed`);
    } else if (status === 'in_progress' || status === 'active') {
      await this.prisma.$transaction(async (tx) => {
        await tx.customerBooking.update({
          where: { id: bookingId },
          data: { status: 'in_progress' },
        });

        await tx.customerSession.updateMany({
          where: { bookingId },
          data: {
            status: 'active',
            checkInTime: new Date(),
          },
        });

        await tx.customerNotification.create({
          data: {
            customerId: booking.customerId,
            title: 'Session Started! 🎉',
            description: `Your session with ${booking.companionName || 'your companion'} is now in progress. Enjoy!`,
            category: 'session',
            icon: 'account-clock',
            iconColor: '#3498DB',
            route: 'ActiveSessionScreen',
            stack: 'BookingsTab',
          },
        });
      });
      this.logger.log(`[S2S] Booking ${bookingId} transitioned to in_progress`);
    } else if (status === 'completed') {
      await this.prisma.$transaction(async (tx) => {
        await tx.customerBooking.update({
          where: { id: bookingId },
          data: { status: 'completed', completedAt: new Date() },
        });

        await tx.customerSession.updateMany({
          where: { bookingId },
          data: {
            status: 'completed',
            checkOutTime: new Date(),
          },
        });

        await tx.customerNotification.create({
          data: {
            customerId: booking.customerId,
            title: 'Session Completed ✓',
            description: `Your session with ${booking.companionName || 'your companion'} has concluded. Please leave a review!`,
            category: 'session',
            icon: 'star',
            iconColor: '#F39C12',
            route: 'SessionFeedbackScreen',
            stack: 'BookingsTab',
          },
        });
      });
      this.logger.log(`[S2S] Booking ${bookingId} transitioned to completed`);
    } else if (status === 'cancelled') {
      await this.prisma.$transaction(async (tx) => {
        await tx.customerBooking.update({
          where: { id: bookingId },
          data: {
            status: 'cancelled',
            cancelReason: dto.reason || 'Cancelled by companion',
            cancelledAt: new Date(),
          },
        });

        await tx.customerSession.updateMany({
          where: { bookingId },
          data: { status: 'cancelled' },
        });

        await tx.customerNotification.create({
          data: {
            customerId: booking.customerId,
            title: 'Booking Cancelled',
            description: `Your booking was cancelled by ${booking.companionName || 'the companion'}.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
            category: 'booking',
            icon: 'calendar-remove',
            iconColor: '#E74C3C',
            route: 'BookingDetailScreen',
            stack: 'BookingsTab',
          },
        });
      });
      this.logger.log(`[S2S] Booking ${bookingId} transitioned to cancelled`);
    }


    const updated = await this.prisma.customerBooking.findUnique({
      where: { id: bookingId },
      include: { sessions: true },
    });

    return {
      success: true,
      message: `Booking status updated to ${status}`,
      booking: this.buildBookingResponse(updated),
    };
  }

  // ── S2S HELPER: DISPATCH BOOKING TO COMPANION BACKEND ─────────────────────
  private async notifyCompanionBackendOfNewBooking(booking: any, customerId: string): Promise<boolean> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, kycStatus: true },
    });
    let initials = 'C.U.';
    if (customer?.name) {
      const parts = customer.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        initials = `${parts[0][0].toUpperCase()}.${parts[1][0].toUpperCase()}.`;
      } else if (parts.length === 1 && parts[0].length > 0) {
        initials = `${parts[0][0].toUpperCase()}.`;
      }
    }
    const isVerified = customer?.kycStatus === 'verified';

    const companionBackendUrl = process.env.COMPANION_API_URL || 'http://localhost:4001';
    const internalToken = process.env.INTERNAL_SERVICE_SECRET;

    const startDate = new Date(booking.date);
    const durationMs = (booking.durationHours || 1) * 60 * 60 * 1000;
    const endDate = new Date(startDate.getTime() + durationMs);

    const payload = {
      bookingId: booking.id,
      companionId: booking.companionId,
      customerId,
      customerInitials: initials,
      customerVerified: isVerified,
      customerSafetyConsent: booking.safetyAcknowledged === true,
      category: this.mapActivityToCategory(booking.activityName),
      venueName: booking.venueName,
      venueArea: booking.venueArea || '',
      venueCity: booking.venueCity || '',
      venueType: booking.venueType || 'UNVERIFIED',
      venueMeetingPoint: booking.meetingPoint || '',
      venueLandmark: booking.landmark || '',
      proposedStart: startDate.toISOString(),
      proposedEnd: endDate.toISOString(),
      durationMinutes: Math.round((booking.durationHours || 1) * 60),
      language: 'Unspecified',
      estimatedEarning: booking.baseTotal,
      customerNote: booking.specialInstructions || undefined,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    if (this.companionClient) {
      try {
        await this.companionClient.createBookingRequest(payload);
        this.logger.log(`Successfully dispatched booking ${booking.id} to companion backend via CompanionClientService`);
        return true;
      } catch {
        this.logger.warn('Failed to dispatch booking request to Companion Backend.');
        return false;
      }
    }

    if (!internalToken) {
      this.logger.warn('Cannot dispatch booking request: S2S secret is not configured.');
      return false;
    }

    try {
      const res = await fetch(`${companionBackendUrl}/api/v1/internal/companion/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service-key': internalToken,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        this.logger.warn(`Failed to dispatch booking request to Companion Backend with status ${res.status}.`);
        return false;
      } else {
        this.logger.log(`Successfully dispatched booking ${booking.id} to companion backend at ${companionBackendUrl}`);
        return true;
      }
    } catch {
      this.logger.warn('Could not connect to Companion Backend to dispatch booking request.');
      return false;
    }
  }

  private mapActivityToCategory(activityName?: string): string {
    if (!activityName) return 'cafe_conversation';
    const norm = activityName.toLowerCase();
    if (norm.includes('walk') || norm.includes('explore')) return 'city_walk';
    if (norm.includes('art') || norm.includes('museum') || norm.includes('gallery')) return 'art_culture';
    if (norm.includes('food') || norm.includes('dine') || norm.includes('dinner') || norm.includes('lunch')) return 'food_experience';
    if (norm.includes('shop')) return 'shopping_assistance';
    if (norm.includes('event') || norm.includes('concert') || norm.includes('festival')) return 'events';
    if (norm.includes('business') || norm.includes('network')) return 'business_networking';
    if (norm.includes('book')) return 'bookstore';
    if (norm.includes('wellness') || norm.includes('fitness') || norm.includes('yoga')) return 'wellness_walk';
    if (norm.includes('movie') || norm.includes('cinema')) return 'movies';
    return 'cafe_conversation';
  }

  private assertLocalScheduleMatches(startDate: Date, date: string, time: string, timeZone: string) {
    const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const timeMatch = time.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!dateMatch || !timeMatch) {
      throw new BadRequestException('Booking date and display time must use supported formats.');
    }

    const [, year, month, day] = dateMatch;
    const [, hourText, minuteText, meridiem] = timeMatch;
    let requestedHour = Number(hourText);
    const requestedMinute = Number(minuteText);
    if (requestedMinute > 59) {
      throw new BadRequestException('Booking display time is invalid.');
    }
    if (meridiem) {
      if (requestedHour < 1 || requestedHour > 12) {
        throw new BadRequestException('Booking display time is invalid.');
      }
      requestedHour = meridiem.toUpperCase() === 'AM'
        ? (requestedHour === 12 ? 0 : requestedHour)
        : (requestedHour === 12 ? 12 : requestedHour + 12);
    } else if (requestedHour > 23) {
      throw new BadRequestException('Booking display time is invalid.');
    }

    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(startDate);
      const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
      if (
        value('year') !== year ||
        value('month') !== month ||
        value('day') !== day ||
        Number(value('hour')) !== requestedHour ||
        Number(value('minute')) !== requestedMinute
      ) {
        throw new BadRequestException('Booking timestamp does not match the selected local date and time.');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('A valid IANA time zone is required for the booking.');
    }
  }
}
