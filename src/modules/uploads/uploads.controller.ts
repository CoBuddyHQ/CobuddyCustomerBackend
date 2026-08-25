import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, createReadStream } from 'fs';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.mp4', '.mov'];

// Ensure upload directories exist
['./uploads/public', './uploads/private'].forEach((dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

@ApiTags('Uploads')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  @Post()
  @ApiOperation({ summary: 'Secure file upload with public/private separation and strict validation' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file: any, cb: any) => {
          const isPrivate = req.query?.isPrivate === 'true' || req.body?.isPrivate === 'true';
          cb(null, isPrivate ? './uploads/private' : './uploads/public');
        },
        filename: (req: any, file: any, cb: any) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
      fileFilter: (req: any, file: any, cb: any) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(
            new BadRequestException(
              `Unsupported file format (${file.mimetype}). Allowed: JPG, PNG, WEBP, PDF, MP4`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('isPrivate') isPrivate?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided or invalid file format');
    }

    const isPriv = isPrivate === 'true';
    const relativeUrl = isPriv
      ? `/api/v1/uploads/private/${file.filename}`
      : `/uploads/public/${file.filename}`;

    return {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      isPrivate: isPriv,
      url: relativeUrl,
    };
  }

  @Get('private/:filename')
  @ApiOperation({ summary: 'Authenticated streaming endpoint for private KYC & Incident files' })
  getPrivateFile(
    @Param('filename') filename: string,
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    // Basic path traversal prevention
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filePath = join(process.cwd(), 'uploads', 'private', sanitizedFilename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Requested private document not found');
    }

    const stream = createReadStream(filePath);
    stream.pipe(res);
  }
}
