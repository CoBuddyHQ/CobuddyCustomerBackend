import { Controller, Post, Param, Body, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { InternalStatusUpdateDto } from './dto/internal-status-update.dto';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';

@ApiTags('Internal - Bookings')
@Controller('internal/bookings')
@UseGuards(InternalServiceGuard)
export class InternalBookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('sync-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal S2S endpoint for companion backend to sync booking status' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true, description: 'Internal S2S Secret Key' })
  @ApiResponse({ status: 200, description: 'Booking status synchronized successfully' })
  @ApiResponse({ status: 400, description: 'Missing booking ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized internal token' })
  async handleSyncStatus(@Body() dto: InternalStatusUpdateDto) {
    const bookingId = dto.customerBookingId || dto.bookingId;
    if (!bookingId) {
      throw new BadRequestException('customerBookingId or bookingId is required');
    }
    return this.bookingService.handleInternalStatusUpdate(bookingId, dto);
  }

  @Post(':id/status-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal service endpoint for companion backend to update booking status' })
  @ApiHeader({ name: 'x-internal-token', required: true, description: 'Internal S2S Secret Token' })
  @ApiResponse({ status: 200, description: 'Booking status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized internal token' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async handleStatusUpdate(
    @Param('id') bookingId: string,
    @Body() dto: InternalStatusUpdateDto,
  ) {
    return this.bookingService.handleInternalStatusUpdate(bookingId, dto);
  }
}
