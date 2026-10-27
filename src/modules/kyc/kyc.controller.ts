import {
  Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
  BadRequestException, Param, Res,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { join } from 'path';
import type { Response } from 'express';
import { validateUpload } from '../../common/utils/upload-content.util';
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

  @Get('files/:folder/:filename')
  async getFile(@CurrentCustomer() customer: any, @Param('folder') folder: string,
    @Param('filename') filename: string, @Res() res: Response) {
    await this.kycService.authorizeFile(customer.id, folder, filename);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    res.sendFile(join(process.cwd(), 'uploads', 'kyc', folder, filename));
  }

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
    validateUpload(front, true);
    if (back) validateUpload(back, true);
    if (!front) throw new BadRequestException('A real front document image is required.');
    const rawType = (dto.docType || dto.documentType || '').toUpperCase();
    const requiresBack = ['AADHAAR', 'DL', 'DRIVING_LICENSE', 'VOTER_ID'].includes(rawType);
    if (requiresBack && !back) throw new BadRequestException('A real back document image is required.');
    const frontDocUrl = `/api/v1/kyc/files/documents/${front.filename}`;
    const backDocUrl = back ? `/api/v1/kyc/files/documents/${back.filename}` : undefined;
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
    validateUpload(file, true);
    const selfieUrl = `/api/v1/kyc/files/selfies/${file.filename}`;
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
    validateUpload(file);
    const livenessUrl = `/api/v1/kyc/files/liveness/${file.filename}`;
    return this.kycService.submitLiveness(customer.id, livenessUrl);
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'Resubmit KYC after rejection' })
  resubmit(@CurrentCustomer() customer: any) {
    return this.kycService.resubmit(customer.id);
  }
}
