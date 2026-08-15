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
