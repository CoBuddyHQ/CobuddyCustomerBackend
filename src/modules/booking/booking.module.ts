import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { InternalBookingController } from './internal-booking.controller';
import { BookingService } from './booking.service';

@Module({
  controllers: [BookingController, InternalBookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}

