import {
  Controller,
  Delete,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { VehicleImagesService } from './vehicle-images.service';

@ApiTags('vehicle-images')
@ApiBearerAuth()
@Controller('vehicles')
export class VehicleImagesController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Post(':id/images')
  @Roles(Role.OWNER)
  @UseInterceptors(FilesInterceptor('files', 8))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Faz upload de imagens do veículo para o MinIO' })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.vehicleImagesService.upload(user.sub, vehicleId, files);
  }

  @Delete(':id/images/:imageId')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Remove uma imagem do veículo' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.vehicleImagesService.remove(user.sub, vehicleId, imageId);
  }
}
