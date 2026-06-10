import { BadRequestException } from '@nestjs/common';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageMimeType(file: Express.Multer.File): void {
  if (!file || !ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
    throw new BadRequestException(
      'Tipo de arquivo não permitido. Use JPG, PNG ou WebP.',
    );
  }
}
