import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, Min, Max, IsBoolean, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VenueDto {
  @ApiProperty({ example: 'Blue Tokai Coffee' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Connaught Place' })
  @IsString()
  @IsOptional()
  area?: string;

  @ApiPropertyOptional({ example: 'New Delhi' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'cafe' })
  @IsString()
  @IsOptional()
  venueType?: string;

  @ApiPropertyOptional({ example: 'Main Entrance' })
  @IsString()
  @IsOptional()
  meetingPoint?: string;

  @ApiPropertyOptional({ example: 'Opposite Metro Gate 2' })
  @IsString()
  @IsOptional()
  landmark?: string;
}

export class CreateBookingDto {
  @ApiProperty({ example: 'companion-uuid-here' })
  @IsString()
  @IsNotEmpty()
  companionId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  companionName?: string;

  @ApiPropertyOptional({ example: 'Coffee Meetup' })
  @IsString()
  @IsOptional()
  activity?: string;

  @ApiProperty({ example: 'Coffee Meetup' })
  @IsString()
  @IsNotEmpty()
  activityName!: string;

  @ApiProperty({ example: 'INT-1' })
  @IsString()
  @IsNotEmpty()
  activityId!: string;

  @ApiPropertyOptional({ example: 'coffee-outline' })
  @IsString()
  @IsOptional()
  activityIcon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  venue?: VenueDto;

  @ApiProperty({ example: 'Blue Tokai Coffee, CP' })
  @IsString()
  @IsNotEmpty()
  venueName!: string;

  @ApiPropertyOptional({ example: 'Connaught Place, New Delhi' })
  @IsString()
  @IsOptional()
  venueAddress?: string;

  @ApiProperty({ example: '2026-10-24T00:00:00.000Z' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '7:00 PM' })
  @IsString()
  @IsNotEmpty()
  time!: string;

  @ApiProperty({ example: 'Asia/Kolkata' })
  @IsString()
  @IsNotEmpty()
  timeZone!: string;

  @ApiProperty({ example: '2026-10-24T19:00:00.000Z' })
  @IsDateString()
  scheduledStart!: string;

  @ApiPropertyOptional({ example: '2026-10-24T21:00:00.000Z' })
  @IsOptional()
  scheduledEnd?: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 8 })
  @IsNumber()
  @Min(1)
  @Max(8)
  durationHours!: number;

  @ApiProperty({ example: true, description: 'Customer confirmed the booking safety agreement.' })
  @IsBoolean()
  @IsIn([true])
  safetyAcknowledged!: true;

  @ApiPropertyOptional({ example: 'Please wear smart casuals.' })
  @IsString()
  @IsOptional()
  specialInstructions?: string;

}

export class BookingPriceQuoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  activityId!: string;

  @ApiProperty({ minimum: 1, maximum: 8 })
  @IsNumber()
  @Min(1)
  @Max(8)
  durationHours: number;
}

export class CounterOfferResponseDto {
  @ApiProperty({ enum: ['accept', 'decline'] })
  @IsString()
  @IsNotEmpty()
  action: 'accept' | 'decline';
}

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'Plans changed' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class DisputeBookingDto {
  @ApiProperty({ example: 'companion_no_show' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class ModifyBookingDto {
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  time?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  venueName?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  durationHours?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  specialInstructions?: string;
}
