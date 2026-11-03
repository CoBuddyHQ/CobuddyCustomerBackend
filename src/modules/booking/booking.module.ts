import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { InternalBookingController } from './internal-booking.controller';
import { BookingService } from './booking.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [BookingController, InternalBookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}


