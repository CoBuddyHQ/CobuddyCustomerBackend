import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async createReview(customerId: string, dto: CreateReviewDto) {
    let bookingId = dto.bookingId;
    if (bookingId) {
      const booking = await this.prisma.customerBooking.findFirst({
        where: { id: bookingId, customerId },
      });
      if (booking && booking.status !== 'completed') {
        await this.prisma.customerBooking.update({
          where: { id: booking.id },
          data: { status: 'completed' },
        });
      }
    } else {
      const existing = await this.prisma.customerBooking.findFirst({
        where: { customerId, companionId: dto.companionId },
        orderBy: { createdAt: 'desc' },
      });
      bookingId = existing?.id;
    }

    if (!bookingId) {
      const autoBooking = await this.prisma.customerBooking.create({
        data: {
          customerId,
          companionId: dto.companionId,
          activityName: 'Session Review',
          venueName: 'Public Venue',
          date: new Date(),
          time: '18:00',
          durationHours: 2,
          baseRate: 500,
          baseTotal: 1000,
          totalAmount: 1000,
          status: 'completed',
        },
      });
      bookingId = autoBooking.id;
    }

    const review = await this.prisma.customerReview.create({
      data: {
        customerId,
        companionId: dto.companionId,
        bookingId,
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
