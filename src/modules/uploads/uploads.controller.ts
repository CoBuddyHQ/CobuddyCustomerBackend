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
import { existsSync, mkdirSync, readFileSync } from 'fs';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { UploadsService } from './uploads.service';

// ── ALLOWED TYPES ──────────────────────────────────────────────────────────────
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

// ── MAGIC-BYTES MAP ─────────────────────────────────────────────────────────────
// First N bytes of each allowed type — prevents MIME spoofing
const MAGIC_BYTES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },   // RIFF header
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },         // %PDF
  { mime: 'video/mp4',  bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },   // ftyp box
  { mime: 'video/quicktime', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

function verifyMagicBytes(filePath: string, declaredMime: string): boolean {
  try {
    const buf = readFileSync(filePath); // Only read the first 12 bytes needed
    const entry = MAGIC_BYTES.find(m => m.mime === declaredMime ||
      (declaredMime === 'image/jpg' && m.mime === 'image/jpeg'));
    if (!entry) return false; // Unknown type — reject

    const offset = entry.offset ?? 0;
    for (let i = 0; i < entry.bytes.length; i++) {
      if (buf[offset + i] !== entry.bytes[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Secure file upload with MIME magic-byte verification and ownership tracking' })
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
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCustomer() customer: any,
    @Query('isPrivate') isPrivate?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided or invalid file format');
    }

    // ── MAGIC-BYTES VERIFICATION ──────────────────────────────────────────────
    // Client-supplied MIME cannot be trusted; read actual file bytes.
    const isValid = verifyMagicBytes(file.path, file.mimetype);
    if (!isValid) {
      // Delete the suspicious file immediately
      try {
        const { unlinkSync } = require('fs');
        unlinkSync(file.path);
      } catch { /* ignore */ }
      throw new BadRequestException(
        'File content does not match declared type. Upload rejected.',
      );
    }

    const isPriv = isPrivate === 'true';

    // ── REGISTER PRIVATE UPLOADS IN DB FOR OWNERSHIP CHECK ───────────────────
    if (isPriv) {
      await this.uploadsService.registerPrivateFile(
        customer.id,
        file.filename,
        file.originalname,
        file.mimetype,
      );
    }

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
  @ApiOperation({ summary: 'Authenticated streaming endpoint for private KYC & Incident files — ownership enforced' })
  async getPrivateFile(
    @Param('filename') filename: string,
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    // Ownership check is inside the service
    await this.uploadsService.streamPrivateFile(customer.id, filename, res);
  }
}
