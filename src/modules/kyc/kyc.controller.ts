import {
  Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
  BadRequestException,
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

const imageFileFilter = (_req: any, file: any, callback: any) => {
  if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
    callback(new BadRequestException('Only JPEG and PNG image files are accepted.'), false);
    return;
  }
  callback(null, true);
};

const livenessFileFilter = (_req: any, file: any, callback: any) => {
  if (!['video/mp4', 'video/quicktime'].includes(file.mimetype)) {
    callback(new BadRequestException('Only MP4 or QuickTime video files are accepted.'), false);
    return;
  }
  callback(null, true);
};

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
  @ApiOperation({ summary: 'Submit KYC document metadata and required front/back images' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'frontDoc', maxCount: 1 }, { name: 'backDoc', maxCount: 1 }],
      {
        storage: kycStorage('documents'),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: imageFileFilter,
      },
    ),
  )
  submitDocument(
    @CurrentCustomer() customer: any,
    @Body() dto: SubmitKycDocumentDto,
    @UploadedFiles() files?: { frontDoc?: any[]; backDoc?: any[] },
  ) {
    const front = files?.frontDoc?.[0];
    const back = files?.backDoc?.[0];
    if (!front) throw new BadRequestException('A real front document image is required.');
    const rawType = (dto.docType || dto.documentType || '').toUpperCase();
    const requiresBack = ['AADHAAR', 'DL', 'DRIVING_LICENSE', 'VOTER_ID'].includes(rawType);
    if (requiresBack && !back) throw new BadRequestException('A real back document image is required.');
    const frontDocUrl = `/uploads/kyc/documents/${front.filename}`;
    const backDocUrl = back ? `/uploads/kyc/documents/${back.filename}` : undefined;
    return this.kycService.submitDocument(customer.id, dto, frontDocUrl, backDocUrl);
  }

  @Post('selfie')
  @ApiOperation({ summary: 'Upload selfie for KYC' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: kycStorage('selfies'),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  submitSelfie(
    @CurrentCustomer() customer: any,
    @UploadedFile() file: any,
  ) {
    if (!file?.filename) throw new BadRequestException('A real selfie image file is required.');
    const selfieUrl = `/uploads/kyc/selfies/${file.filename}`;
    return this.kycService.submitSelfie(customer.id, selfieUrl);
  }

  @Post('liveness')
  @ApiOperation({ summary: 'Submit liveness check video/image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: kycStorage('liveness'),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: livenessFileFilter,
    }),
  )
  submitLiveness(
    @CurrentCustomer() customer: any,
    @UploadedFile() file: any,
  ) {
    if (!file?.filename) throw new BadRequestException('A real liveness video file is required.');
    const livenessUrl = `/uploads/kyc/liveness/${file.filename}`;
    return this.kycService.submitLiveness(customer.id, livenessUrl);
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'Resubmit KYC after rejection' })
  resubmit(@CurrentCustomer() customer: any) {
    return this.kycService.resubmit(customer.id);
  }
}
