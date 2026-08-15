import {
  Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { KycService } from './kyc.service';
import { SubmitKycDocumentDto } from './dto/kyc.dto';

const kycStorage = (folder: string) =>
  diskStorage({
    destination: `./uploads/kyc/${folder}`,
    filename: (req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  });

@ApiTags('KYC')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get KYC verification status' })
  getStatus(@CurrentCustomer() customer: any) {
    return this.kycService.getStatus(customer.id);
  }

  @Post('document')
  @ApiOperation({ summary: 'Submit KYC document info + front/back images' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'frontDoc', maxCount: 1 }, { name: 'backDoc', maxCount: 1 }],
      { storage: kycStorage('documents'), limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  submitDocument(
    @CurrentCustomer() customer: any,
    @Body() dto: SubmitKycDocumentDto,
    @UploadedFiles() files: { frontDoc?: any[]; backDoc?: any[] },
  ) {
    const frontDocUrl = files?.frontDoc?.[0] ? `/uploads/kyc/documents/${files.frontDoc[0].filename}` : undefined;
    const backDocUrl = files?.backDoc?.[0] ? `/uploads/kyc/documents/${files.backDoc[0].filename}` : undefined;
    return this.kycService.submitDocument(customer.id, dto, frontDocUrl, backDocUrl);
  }

  @Post('selfie')
  @ApiOperation({ summary: 'Upload selfie for KYC' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { storage: kycStorage('selfies'), limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  submitSelfie(@CurrentCustomer() customer: any, @UploadedFile() file: any) {
    const selfieUrl = `/uploads/kyc/selfies/${file.filename}`;
    return this.kycService.submitSelfie(customer.id, selfieUrl);
  }

  @Post('liveness')
  @ApiOperation({ summary: 'Submit liveness check video/image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { storage: kycStorage('liveness'), limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  submitLiveness(@CurrentCustomer() customer: any, @UploadedFile() file: any) {
    const livenessUrl = `/uploads/kyc/liveness/${file.filename}`;
    return this.kycService.submitLiveness(customer.id, livenessUrl);
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'Resubmit KYC after rejection' })
  resubmit(@CurrentCustomer() customer: any) {
    return this.kycService.resubmit(customer.id);
  }
}
