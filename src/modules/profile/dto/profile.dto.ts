import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Shlok' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Tech enthusiast and coffee lover.' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ example: 24 })
  @IsInt()
  @Min(18)
  @Max(100)
  @IsOptional()
  age?: number;

  @ApiPropertyOptional({ example: 'Male' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ example: 'Mumbai, MH' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: '15/08/1998' })
  @IsString()
  @IsOptional()
  dob?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde' })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional({ example: '+91' })
  @IsString()
  @IsOptional()
  countryCode?: string;
}

export class CompleteOnboardingDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  age?: number;
}

export class SubmitLegalConsentDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  tosAccepted?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  privacyAccepted?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  communityGuidelinesAccepted?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  safetyAgreementAccepted?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  allAccepted?: boolean;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 19.076 })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: 72.8777 })
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Bandra West, Mumbai' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  permissionGranted?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  skipped?: boolean;
}
