import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';
import { CompanionClientService } from '../companion-client/companion-client.service';

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

    // S2S cross-service sync to Companion Backend
    this.companionClient.syncReviewToCompanion(targetCompanionId, {
      bookingId: dto.bookingId,
      customerId,
      customerInitials: initials,
      rating: dto.rating,
      comment: dto.comment || dto.text,
      tags: dto.tags || [],
      punctuality: dto.punctuality,
      communication: dto.communication,
      behavior: dto.behavior,
    }).catch((err) => {
      this.logger.warn(`Failed S2S companion review sync: ${err.message}`);
    });

    // S2S cross-service sync to Admin Backend
    this.companionClient.syncReviewToAdmin({
      bookingId: dto.bookingId,
      byCustomerId: customerId,
      toCompanionId: targetCompanionId,
      rating: dto.rating,
      text: dto.comment || dto.text,
      tagCodes: dto.tags || [],
    }).catch((err) => {
      this.logger.warn(`Failed S2S admin review sync: ${err.message}`);
    });

    return review;
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
