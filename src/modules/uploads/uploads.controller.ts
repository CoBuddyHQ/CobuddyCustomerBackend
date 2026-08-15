import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Uploads')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  @Post()
  @ApiOperation({ summary: 'Generic file upload endpoint' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/media',
        filename: (req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadFile(@UploadedFile() file: any) {
    return {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/media/${file.filename}`,
    };
  }
}
