import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class VehicleImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly cacheQueueService: CacheQueueService,
  ) {}

  async upload(
    ownerId: string,
    vehicleId: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Envie pelo menos um arquivo.');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        images: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.ownerId !== ownerId) {
      throw new BadRequestException(
        'Apenas o proprietário pode enviar imagens para o veículo.',
      );
    }

    let position = vehicle.images.length;
    const uploadedImages = [];

    for (const file of files) {
      const uploaded = await this.storageService.uploadPublicFile(
        file,
        'vehicles',
      );
      const createdImage = await this.prisma.vehicleImage.create({
        data: {
          vehicleId,
          url: uploaded.url,
          key: uploaded.key,
          position,
        },
      });

      uploadedImages.push(createdImage);
      position += 1;
    }

    await this.cacheQueueService.del(`vehicles:detail:${vehicleId}`);
    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');

    return uploadedImages;
  }

  async remove(ownerId: string, vehicleId: string, imageId: string) {
    const image = await this.prisma.vehicleImage.findFirst({
      where: {
        id: imageId,
        vehicleId,
        vehicle: {
          ownerId,
        },
      },
    });

    if (!image) {
      throw new NotFoundException('Imagem não encontrada.');
    }

    await this.storageService.deleteObject(image.key);
    await this.prisma.vehicleImage.delete({
      where: { id: imageId },
    });

    await this.cacheQueueService.del(`vehicles:detail:${vehicleId}`);
    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');

    return { message: 'Imagem removida com sucesso.' };
  }
}
