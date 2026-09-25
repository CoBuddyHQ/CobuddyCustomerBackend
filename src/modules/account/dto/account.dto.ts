import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bookingNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() chatNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() safetyNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['en', 'hi', 'te', 'ta', 'mr', 'bn', 'gu', 'kn', 'ml', 'pa']) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() locationEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() darkMode?: boolean;
}

export class UpdateNotificationPrefsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bookings?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() messages?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() promotions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() safety?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bookingPush?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bookingReminders?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() chatPush?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() promoPush?: boolean;
}

export class UpdateLanguagesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() appLanguage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString({ each: true }) spokenLanguages?: string[];
}

export class RequestOtpChangeMobileDto {
  @IsString() oldPhone: string;
  @IsString() newPhone: string;
}

export class VerifyChangeMobileDto {
  @IsString() oldPhone: string;
  @IsString() newPhone: string;
  @IsString() oldOtp: string;
  @IsString() newOtp: string;
}

export class ReactivationRequestDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() reason?: string;
}
