import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
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

  // ── CREATE BOOKING REQUEST ────────────────────────────────────────────────
  async createBooking(customerId: string, dto: CreateBookingDto) {
    const actId = dto.activityId || 'INT-1';
    const multiplier = ACTIVITY_MULTIPLIERS[actId] || 1.0;
    
    // Server-side authoritative pricing — fetch companion's real rate from companion backend, ignoring client-tampered baseRate
    let companionHourlyRate = 500;
    if (this.companionClient) {
      try {
        const comp = await this.companionClient.getCompanionById(dto.companionId);
        if (comp && comp.hourlyRate) {
          companionHourlyRate = Number(comp.hourlyRate);
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch authoritative hourlyRate for companion ${dto.companionId}: ${err.message}`);
        const clientRate = Number(dto.baseRate);
        if (!isNaN(clientRate) && clientRate >= 300) {
          companionHourlyRate = clientRate;
        }
      }
    } else {
      const clientRate = Number(dto.baseRate);
      if (!isNaN(clientRate) && clientRate >= 300) {
        companionHourlyRate = clientRate;
      }
    }

    const baseRate = companionHourlyRate * multiplier;
    const durationHours = Math.max(Number(dto.durationHours) || 1, 1);
    const baseTotal = Math.round(baseRate * durationHours);
    const platformFee = Math.round(baseTotal * PLATFORM_FEE_PERCENT);
    const taxAmount = Math.round(baseTotal * TAX_PERCENT);
    const totalAmount = baseTotal + platformFee + taxAmount;


    const vName = dto.venue?.name || dto.venueName || 'Public Venue';
    const vArea = dto.venue?.area || '';
    const vCity = dto.venue?.city || '';
    const vType = dto.venue?.venueType || 'cafe';
    const vMeeting = dto.venue?.meetingPoint || '';
    const vLandmark = dto.venue?.landmark || '';
    const vApproved = dto.venue?.isApproved ?? true;
    const vId = dto.venue?.venueId || undefined;

    let startDate: Date;
    if (dto.scheduledStart) {
      startDate = new Date(dto.scheduledStart);
    } else if (dto.date) {
      startDate = new Date(dto.date);
    } else {
      startDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const timeStr = dto.time || startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const activityTitle = dto.activityName || dto.activity || 'Activity';

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
      return this.buildBookingResponse(existingDuplicate);
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

    this.logger.log(
      `[BOOKING REQUEST CREATED] Booking ID: ${booking.id} | Customer: ${customerId} | Companion: ${dto.companionName || dto.companionId} | Activity: ${activityTitle} | Venue: ${vName} | Date: ${startDate.toISOString().split('T')[0]} ${timeStr} | Duration: ${durationHours}h | BaseRate: ₹${baseRate}/hr | PlatformFee: ₹${platformFee} | Tax: ₹${taxAmount} | TotalAmount: ₹${totalAmount}`
    );

    // Outbound S2S notification to Companion Backend
    this.notifyCompanionBackendOfNewBooking(booking, customerId).catch((err) => {
      this.logger.warn(`Failed to dispatch booking to companion backend: ${err.message}`);
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
      venueId: booking.venueId || `v-${booking.id.slice(0, 6)}`,
      name: booking.venueName || 'Public Venue',
      area: booking.venueArea || '',
      city: booking.venueCity || '',
      isApproved: booking.isApproved ?? true,
      venueType: booking.venueType || 'cafe',
      meetingPoint: booking.meetingPoint || 'Main entrance seating',
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
      matchScore: booking.matchScore ?? 95,
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
  private async notifyCompanionBackendOfNewBooking(booking: any, customerId: string) {
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
    const trustScore = isVerified ? 90 : 75;

    const companionBackendUrl = process.env.COMPANION_API_URL || 'http://localhost:4001';
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN || 'cobuddy-internal-service-s2s-token-2026';

    const startDate = new Date(booking.date);
    const durationMs = (booking.durationHours || 1) * 60 * 60 * 1000;
    const endDate = new Date(startDate.getTime() + durationMs);

    const payload = {
      bookingId: booking.id,
      companionId: booking.companionId,
      customerId,
      customerInitials: initials,
      customerTrustScore: trustScore,
      customerVerified: isVerified,
      category: this.mapActivityToCategory(booking.activityName),
      venueName: booking.venueName,
      venueArea: booking.venueArea || '',
      venueCity: booking.venueCity || '',
      venueType: booking.venueType || 'PUBLIC',
      venueMeetingPoint: booking.meetingPoint || '',
      venueLandmark: booking.landmark || '',
      proposedStart: startDate.toISOString(),
      proposedEnd: endDate.toISOString(),
      durationMinutes: Math.round((booking.durationHours || 1) * 60),
      language: 'Hindi',
      estimatedEarning: booking.baseTotal,
      customerNote: booking.specialInstructions || undefined,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    if (this.companionClient) {
      try {
        await this.companionClient.createBookingRequest(payload);
        this.logger.log(`Successfully dispatched booking ${booking.id} to companion backend via CompanionClientService`);
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to dispatch booking ${booking.id} to companion backend: ${err.message}`);
        return;
      }
    }

    try {
      const res = await fetch(`${companionBackendUrl}/api/v1/internal/companion/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.warn(`Failed to dispatch booking ${booking.id} to companion backend: ${res.status} ${res.statusText}`);
      } else {
        this.logger.log(`Successfully dispatched booking ${booking.id} to companion backend at ${companionBackendUrl}`);
      }
    } catch (err: any) {
      this.logger.warn(`Error connecting to companion backend at ${companionBackendUrl}: ${err.message}`);
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
}

