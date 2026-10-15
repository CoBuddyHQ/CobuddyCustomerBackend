import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class InternalStatusUpdateDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsString()
  passCode?: string;

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
  @IsString()
  newStart?: string;

  @IsOptional()
  @IsString()
  newEnd?: string;
}
