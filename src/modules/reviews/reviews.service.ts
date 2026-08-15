import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async createReview(customerId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.customerBooking.findFirst({
      where: { id: dto.bookingId, customerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.status !== 'completed') {
      throw new BadRequestException('You can only review completed sessions');
    }

    const review = await this.prisma.customerReview.create({
      data: {
        customerId,
        companionId: dto.companionId,
        bookingId: dto.bookingId,
        rating: dto.rating,
        comment: dto.comment,
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
