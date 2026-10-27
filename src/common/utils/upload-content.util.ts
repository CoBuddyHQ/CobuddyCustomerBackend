import { BadRequestException } from '@nestjs/common';
import { readFileSync, unlinkSync } from 'fs';
import { extname } from 'path';

export function validateUpload(file: Express.Multer.File | undefined, imagesOnly = false): void {
  if (!file) throw new BadRequestException('A file is required');
  const formats: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'],
    'application/pdf': ['.pdf'], 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'],
  };
  const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
  let valid = Boolean(formats[mime]?.includes(extname(file.originalname).toLowerCase()));
  if (imagesOnly && !mime.startsWith('image/')) valid = false;
  const bytes = file.buffer ?? (file.path ? readFileSync(file.path) : Buffer.alloc(0));
  const hex = bytes.subarray(0, 8).toString('hex');
  valid = valid && ({
    'image/jpeg': hex.startsWith('ffd8ff'),
    'image/png': hex === '89504e470d0a1a0a',
    'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    'application/pdf': bytes.toString('ascii', 0, 5) === '%PDF-',
    'video/mp4': bytes.toString('ascii', 4, 8) === 'ftyp',
    'video/quicktime': bytes.toString('ascii', 4, 8) === 'ftyp',
  }[mime] ?? false);
  if (!valid) {
    if (file.path) { try { unlinkSync(file.path); } catch { /* Already removed. */ } }
    throw new BadRequestException('File extension, media type and content must match');
  }
}
