import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Client as MinioClient } from 'minio';
import { extname } from 'path';
import sharp from 'sharp';

type UploadFile = Pick<
  Express.Multer.File,
  'buffer' | 'mimetype' | 'originalname' | 'size'
>;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly publicBucket: string;
  private readonly publicUrl: string;
  private readonly endpoint: string;
  private readonly client: MinioClient;

  constructor(private readonly configService: ConfigService) {
    this.publicBucket = this.configService.get<string>(
      'storage.bucket',
      'triluga-public',
    );
    this.publicUrl = this.configService.get<string>(
      'storage.publicUrl',
      'http://localhost:9000/triluga-public',
    );
    this.endpoint = this.configService.get<string>(
      'storage.endpoint',
      'localhost',
    );
    this.client = new MinioClient({
      endPoint: this.endpoint,
      port: this.configService.get<number>('storage.port', 9000),
      useSSL: this.configService.get<boolean>('storage.useSSL', false),
      accessKey: this.configService.get<string>(
        'storage.accessKey',
        'minioadmin',
      ),
      secretKey: this.configService.get<string>(
        'storage.secretKey',
        'minioadmin',
      ),
    });
  }

  async ensureBucketExists() {
    try {
      await this.ensureBucket(this.publicBucket);

      if (this.isCloudflareR2()) {
        this.logger.log(
          `Storage conectado via Cloudflare R2. Bucket validado: ${this.publicBucket}.`,
        );
        return;
      }

      await this.ensureBucketIsPublic(this.publicBucket);
      this.logger.log(
        `Storage conectado. Bucket validado: ${this.publicBucket}.`,
      );
    } catch (error) {
      this.logger.warn(
        `Não foi possível validar/criar os buckets do storage. Uploads podem falhar até o serviço ficar disponível. ${
          error instanceof Error ? error.message : 'Erro desconhecido'
        }`,
      );
    }
  }

  async uploadPublicFile(
    file: Express.Multer.File,
    folder: 'vehicles' | 'users',
  ) {
    const optimizedFile = await this.optimizePublicImage(file, folder);
    const extension = this.getUploadExtension(optimizedFile);
    const objectKey = `${folder}/${randomUUID()}${extension}`;

    await this.putObject(this.publicBucket, objectKey, optimizedFile);

    return {
      key: objectKey,
      url: `${this.publicUrl}/${objectKey}`,
    };
  }

  async deletePublicFileByUrl(url: string | null | undefined) {
    const objectKey = this.extractObjectKeyFromPublicUrl(url);

    if (!objectKey) {
      return;
    }

    await this.deleteObjectFromBucket(this.publicBucket, objectKey);
  }

  async deleteObject(objectKey: string) {
    await this.deleteObjectFromBucket(this.publicBucket, objectKey);
  }

  private async ensureBucket(bucket: string) {
    const exists = await this.client.bucketExists(bucket);

    if (!exists) {
      await this.client.makeBucket(bucket);
    }
  }

  private async ensureBucketIsPublic(bucket: string) {
    const publicReadPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            AWS: ['*'],
          },
          Action: ['s3:GetBucketLocation'],
          Resource: [`arn:aws:s3:::${bucket}`],
        },
        {
          Effect: 'Allow',
          Principal: {
            AWS: ['*'],
          },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };

    await this.client.setBucketPolicy(bucket, JSON.stringify(publicReadPolicy));
  }

  private isCloudflareR2() {
    return this.endpoint.endsWith('.r2.cloudflarestorage.com');
  }

  private async putObject(bucket: string, objectKey: string, file: UploadFile) {
    await this.client.putObject(bucket, objectKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });
  }

  private async optimizePublicImage(
    file: Express.Multer.File,
    folder: 'vehicles' | 'users',
  ): Promise<UploadFile> {
    if (!file.mimetype.startsWith('image/')) {
      return file;
    }

    const size =
      folder === 'users'
        ? { width: 768, height: 768, quality: 78 }
        : { width: 1600, height: 1200, quality: 76 };

    try {
      const buffer = await sharp(file.buffer, {
        failOn: 'none',
      })
        .rotate()
        .resize({
          width: size.width,
          height: size.height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: size.quality,
          effort: 5,
        })
        .toBuffer();

      return {
        buffer,
        mimetype: 'image/webp',
        originalname: `${file.originalname.replace(/\.[^.]+$/, '')}.webp`,
        size: buffer.length,
      };
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel otimizar imagem ${file.originalname}: ${
          error instanceof Error ? error.message : 'Erro desconhecido'
        }`,
      );
      return file;
    }
  }

  private getUploadExtension(file: UploadFile) {
    if (file.mimetype === 'image/webp') {
      return '.webp';
    }

    return extname(file.originalname || '') || '.bin';
  }

  private async deleteObjectFromBucket(bucket: string, objectKey: string) {
    await this.client.removeObject(bucket, objectKey);
  }

  private extractObjectKeyFromPublicUrl(url: string | null | undefined) {
    if (!url) {
      return null;
    }

    const normalizedPublicUrl = this.publicUrl.replace(/\/+$/, '');

    if (url.startsWith(`${normalizedPublicUrl}/`)) {
      return url.slice(normalizedPublicUrl.length + 1);
    }

    try {
      const parsedUrl = new URL(url);
      const parsedPublicUrl = new URL(normalizedPublicUrl);

      if (parsedUrl.origin !== parsedPublicUrl.origin) {
        return null;
      }

      const publicPath = parsedPublicUrl.pathname.replace(/\/+$/, '');

      if (!parsedUrl.pathname.startsWith(`${publicPath}/`)) {
        return null;
      }

      return decodeURIComponent(
        parsedUrl.pathname.slice(publicPath.length + 1),
      );
    } catch {
      this.logger.warn(
        `Nao foi possivel extrair a chave do arquivo publico: ${url}`,
      );
      return null;
    }
  }
}
