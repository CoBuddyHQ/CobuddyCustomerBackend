import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/reviews.dto';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Submit review for completed session' })
  createReview(@CurrentCustomer() customer: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(customer.id, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Get reviews submitted by me' })
  getMyReviews(@CurrentCustomer() customer: any) {
    return this.reviewsService.getMyReviews(customer.id);
  }

  @Get('companion/:companionId')
  @ApiOperation({ summary: 'Get public reviews for a companion' })
  getCompanionReviews(@Param('companionId') companionId: string) {
    return this.reviewsService.getCompanionReviews(companionId);
  }
}
