import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { BookingService } from './booking.service';
import {
  CreateBookingDto, CancelBookingDto, DisputeBookingDto,
  ModifyBookingDto, CounterOfferResponseDto,
} from './dto/booking.dto';

@ApiTags('Bookings')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new booking request' })
  createBooking(@CurrentCustomer() customer: any, @Body() dto: CreateBookingDto) {
    return this.bookingService.createBooking(customer.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my bookings' })
  @ApiQuery({ name: 'filter', required: false, enum: ['pending', 'accepted', 'history'] })
  listBookings(@CurrentCustomer() customer: any, @Query('filter') filter?: string) {
    return this.bookingService.listBookings(customer.id, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking detail' })
  getBooking(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.bookingService.getBooking(customer.id, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  cancelBooking(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelBooking(customer.id, id, dto);
  }

  @Patch(':id/modify')
  @ApiOperation({ summary: 'Modify a pending booking' })
  modifyBooking(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() dto: ModifyBookingDto,
  ) {
    return this.bookingService.modifyBooking(customer.id, id, dto);
  }

  @Patch(':id/counter-offer')
  @ApiOperation({ summary: 'Accept or decline a counter offer' })
  respondToCounterOffer(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() dto: CounterOfferResponseDto,
  ) {
    return this.bookingService.respondToCounterOffer(customer.id, id, dto);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'File a dispute for a booking' })
  disputeBooking(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() dto: DisputeBookingDto,
  ) {
    return this.bookingService.disputeBooking(customer.id, id, dto);
  }
}
