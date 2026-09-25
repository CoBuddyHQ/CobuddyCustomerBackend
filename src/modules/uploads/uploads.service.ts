import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import type { Response } from 'express';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Register a private upload so we know which customerId owns which filename.
   * Called after multer saves the file to disk.
   */
  async registerPrivateFile(customerId: string, filename: string, originalName: string, mimeType: string): Promise<void> {
    await this.prisma.customerUpload.create({
      data: {
        customerId,
        filename,
        originalName,
        mimeType,
        isPrivate: true,
      },
    });
    this.logger.log(`[UPLOAD] Registered private file: ${filename} for customer: ${customerId}`);
  }

  /**
   * Stream a private file — enforces ownership: only the uploading customer
   * (or an admin token, extended later) may access it.
   */
  async streamPrivateFile(customerId: string, filename: string, res: Response): Promise<void> {
    // 1. Verify ownership in DB
    const record = await this.prisma.customerUpload.findUnique({
      where: { filename },
    });

    if (!record) {
      throw new NotFoundException('Requested private document not found');
    }

    if (record.customerId !== customerId) {
      // Log IDOR attempt for audit
      this.logger.warn(
        `[UPLOAD IDOR] customerId: ${customerId} tried to access file owned by: ${record.customerId} | filename: ${filename}`,
      );
      throw new ForbiddenException('Access denied to requested document');
    }

    // 2. Basic path traversal prevention (UUID filenames should already be safe)
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filePath = join(process.cwd(), 'uploads', 'private', sanitizedFilename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    // 3. Stream the file
    const stream = createReadStream(filePath);
    stream.pipe(res);
  }
}
