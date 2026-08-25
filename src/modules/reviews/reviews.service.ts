import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

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

    const review = await this.prisma.customerReview.create({
      data: {
        customerId,
        companionId: booking.companionId || dto.companionId,
        bookingId: dto.bookingId,
        rating: dto.rating,
        comment: dto.comment || dto.text,
        punctuality: dto.punctuality,
        communication: dto.communication,
        behavior: dto.behavior,
      },
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
