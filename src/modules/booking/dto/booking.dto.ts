import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive, IsDateString, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VenueDto {
  @ApiPropertyOptional({ example: 'v-1' })
  @IsString()
  @IsOptional()
  venueId?: string;

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isApproved?: boolean;

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

  @ApiPropertyOptional({ example: 'Coffee Meetup' })
  @IsString()
  @IsOptional()
  activityName?: string;

  @ApiPropertyOptional({ example: 'a1' })
  @IsString()
  @IsOptional()
  activityId?: string;

  @ApiPropertyOptional({ example: 'coffee-outline' })
  @IsString()
  @IsOptional()
  activityIcon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  venue?: VenueDto;

  @ApiPropertyOptional({ example: 'Blue Tokai Coffee, CP' })
  @IsString()
  @IsOptional()
  venueName?: string;

  @ApiPropertyOptional({ example: 'Connaught Place, New Delhi' })
  @IsString()
  @IsOptional()
  venueAddress?: string;

  @ApiPropertyOptional({ example: '2026-10-24T00:00:00.000Z' })
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ example: '7:00 PM' })
  @IsString()
  @IsOptional()
  time?: string;

  @ApiPropertyOptional({ example: '2026-10-24T19:00:00.000Z' })
  @IsOptional()
  scheduledStart?: string;

  @ApiPropertyOptional({ example: '2026-10-24T21:00:00.000Z' })
  @IsOptional()
  scheduledEnd?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(8)
  durationHours?: number;

  @ApiPropertyOptional({ example: 'Please wear smart casuals.' })
  @IsString()
  @IsOptional()
  specialInstructions?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsNumber()
  @IsOptional()
  @IsPositive()
  baseRate?: number;  // Per hour rate in INR
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
