import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class InternalStatusUpdateDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsString()
  customerBookingId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  passCode?: string;

  @IsOptional()
  @IsString()
  sessionPassCode?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  companionId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsNumber()
  companionEarnings?: number;

  @IsOptional()
  @IsString()
  newStart?: string;

  @IsOptional()
  @IsString()
  newEnd?: string;
}
