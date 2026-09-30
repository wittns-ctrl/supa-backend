import {
  BadRequestException,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Content sniffing — trust the bytes, not the declared mimetype or filename.
 * Extensions are derived from what the file actually is.
 */
function sniffImageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (!buf || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

const SAFE_FILENAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/i;

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  @Post()
  @Roles(roles.OWNER, roles.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded — send multipart/form-data with a "file" field',
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('Image exceeds the 5 MB limit');
    }

    const ext = sniffImageExt(file.buffer);
    if (!ext) {
      throw new BadRequestException(
        'Only real JPEG, PNG, or WebP images are allowed',
      );
    }

    // UUID filename — original name never touches the disk
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    writeFileSync(join(UPLOAD_DIR, filename), file.buffer);

    return { url: `/uploads/${filename}`, size: file.size };
  }

  @Delete(':filename')
  @Roles(roles.OWNER, roles.ADMIN)
  remove(@Param('filename') filename: string) {
    if (!SAFE_FILENAME.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
    const target = resolve(UPLOAD_DIR, filename);
    // Defense in depth: refuse anything that escapes the upload dir
    if (!target.startsWith(UPLOAD_DIR + sep)) {
      throw new BadRequestException('Invalid filename');
    }
    if (!existsSync(target)) {
      throw new NotFoundException('File not found');
    }
    unlinkSync(target);
    return { message: 'File deleted' };
  }
}
