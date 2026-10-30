import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';
import { CompanionClientService } from '../companion-client/companion-client.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private prisma: PrismaService,
    private companionClient: CompanionClientService,
  ) {}

  async createReview(customerId: string, dto: CreateReviewDto) {
    if (!dto.bookingId) {
      throw new BadRequestException('A valid bookingId is required to submit a review');
    }

    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: dto.bookingId, customerId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found or does not belong to this customer');
    }

    if (booking.status !== 'completed') {
      throw new BadRequestException(`Cannot review a booking with status '${booking.status}'. Only completed sessions can be reviewed.`);
    }

    // Check if review already exists for this booking
    const existingReview = await this.prisma.customerReview.findFirst({
      where: { bookingId: dto.bookingId, customerId },
    });
    if (existingReview) {
      throw new BadRequestException('A review has already been submitted for this booking');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
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

    const targetCompanionId = booking.companionId || dto.companionId;

    const review = await this.prisma.customerReview.create({
      data: {
        customerId,
        companionId: targetCompanionId,
        bookingId: dto.bookingId,
        rating: dto.rating,
        comment: dto.comment || dto.text,
        tags: dto.tags || [],
        punctuality: dto.punctuality,
        communication: dto.communication,
        behavior: dto.behavior,
      },
    });

    void this.syncReviewDownstream(
      { ...review, customer: { name: customer?.name } },
      initials,
    ).catch(() => this.logger.warn('Could not queue immediate review sync.'));

    return review;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryPendingReviewSyncs(): Promise<void> {
    const retryBefore = new Date(Date.now() - 60_000);
    try {
      const pending = await this.prisma.customerReview.findMany({
        where: {
          OR: [
            {
              companionSyncedAt: null,
              OR: [
                { companionSyncAttemptedAt: null },
                { companionSyncAttemptedAt: { lte: retryBefore } },
              ],
            },
            {
              adminSyncedAt: null,
              OR: [
                { adminSyncAttemptedAt: null },
                { adminSyncAttemptedAt: { lte: retryBefore } },
              ],
            },
          ],
        },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const review of pending) {
        await this.syncReviewDownstream(review).catch(() => {
          this.logger.warn('A pending review sync attempt failed safely.');
        });
      }
    } catch {
      this.logger.warn('Could not process pending downstream review syncs.');
    }
  }

  private async syncReviewDownstream(review: any, knownInitials?: string): Promise<void> {
    const initials = knownInitials || this.customerInitials(review.customer?.name);
    if (!review.companionSyncedAt) {
      const attemptedAt = new Date();
      await this.prisma.customerReview.update({
        where: { id: review.id },
        data: { companionSyncAttemptedAt: attemptedAt },
      });
      try {
        await this.companionClient.syncReviewToCompanion(review.companionId, {
          bookingId: review.bookingId,
          customerId: review.customerId,
          customerInitials: initials,
          rating: review.rating,
          comment: review.comment,
          tags: review.tags || [],
          punctuality: review.punctuality,
          communication: review.communication,
          behavior: review.behavior,
        });
        await this.prisma.customerReview.update({
          where: { id: review.id },
          data: { companionSyncedAt: new Date() },
        });
      } catch {
        this.logger.warn('Customer review is queued for Companion sync retry.');
      }
    }

    if (!review.adminSyncedAt) {
      const attemptedAt = new Date();
      await this.prisma.customerReview.update({
        where: { id: review.id },
        data: { adminSyncAttemptedAt: attemptedAt },
      });
      try {
        await this.companionClient.syncReviewToAdmin({
          bookingId: review.bookingId,
          byCustomerId: review.customerId,
          toCompanionId: review.companionId,
          rating: review.rating,
          text: review.comment,
          tagCodes: review.tags || [],
        });
        await this.prisma.customerReview.update({
          where: { id: review.id },
          data: { adminSyncedAt: new Date() },
        });
      } catch {
        this.logger.warn('Customer review is queued for Admin sync retry.');
      }
    }
  }

  private customerInitials(name?: string | null): string {
    if (!name?.trim()) return 'C.U.';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0][0].toUpperCase()}.${parts[1][0].toUpperCase()}.`
      : `${parts[0][0].toUpperCase()}.`;
  }

  async getMyReviews(customerId: string) {
    return this.prisma.customerReview.findMany({
      where: { customerId },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCompanionReviews(companionId: string) {
    return this.prisma.customerReview.findMany({
      where: { companionId, isPublic: true },
      include: { customer: { select: { name: true, photoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
