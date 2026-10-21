import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUpload {
  secure_url: string;
  public_id: string;
  bytes: number;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  readonly folder: string;
  readonly isConfigured: boolean;

  constructor(config: ConfigService) {
    const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    this.folder = (config.get<string>('CLOUDINARY_FOLDER') || 'supameal')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);

    if (this.isConfigured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    }
  }

  async upload(buffer: Buffer, format: string, publicId: string): Promise<CloudinaryUpload> {
    if (!this.isConfigured) throw new ServiceUnavailableException('Cloudinary is not configured');
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: this.folder,
          public_id: publicId,
          format,
          overwrite: false,
          unique_filename: false,
        },
        (error, result) => {
          if (error || !result?.secure_url || !result.public_id) {
            this.logger.error(`Cloudinary upload failed: ${error?.message || 'No asset returned'}`);
            reject(new ServiceUnavailableException('Image storage is temporarily unavailable'));
            return;
          }
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            bytes: result.bytes || buffer.length,
          });
        },
      );
      Readable.from([buffer]).pipe(uploadStream).on('error', (error) => {
        this.logger.error(`Cloudinary upload stream failed: ${error.message}`);
        reject(new ServiceUnavailableException('Image storage is temporarily unavailable'));
      });
    });
  }

  async delete(publicId: string): Promise<boolean> {
    if (!this.isConfigured) throw new ServiceUnavailableException('Cloudinary is not configured');
    if (!this.isManagedAsset(publicId)) return false;
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    return result.result === 'ok';
  }

  isManagedAsset(publicId: string): boolean {
    const expectedPrefix = `${this.folder}/`;
    return publicId.startsWith(expectedPrefix) && /^[A-Za-z0-9_/-]+$/.test(publicId);
  }
}
