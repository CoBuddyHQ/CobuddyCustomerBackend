import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { KycService } from './kyc.service';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';

export class UpdateVerificationStatusDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty({ description: 'Verification decision status', enum: ['approved', 'rejected'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['approved', 'rejected', 'APPROVED', 'REJECTED'])
  status!: string;

  @ApiPropertyOptional({ description: 'Rejection or approval reason notes' })
  @IsString()
  @IsOptional()
  reason?: string;
}

@ApiTags('Internal - KYC')
@Controller('internal')
@UseGuards(InternalServiceGuard)
export class InternalKycController {
  constructor(private readonly kycService: KycService) {}

  @Post('verification-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal S2S endpoint for Admin backend to sync KYC verification decision' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true, description: 'Internal S2S Secret Key' })
  @ApiResponse({ status: 200, description: 'Customer verification status updated successfully' })
  @ApiResponse({ status: 400, description: 'Missing customerId or status' })
  @ApiResponse({ status: 401, description: 'Unauthorized internal token' })
  async handleVerificationStatus(@Body() body: UpdateVerificationStatusDto) {
    if (!body?.customerId || !body?.status) {
      throw new BadRequestException('customerId and status (approved | rejected) are required');
    }
    return this.kycService.updateVerificationStatus(body.customerId, body.status, body.reason);
  }
}
