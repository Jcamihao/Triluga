import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('my')
  @ApiOperation({ summary: 'Lista os veículos favoritos do usuário autenticado' })
  listMyFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.favoritesService.listMyFavorites(user.sub);
  }

  @Post(':vehicleId')
  @ApiOperation({ summary: 'Adiciona um veículo aos favoritos do usuário autenticado' })
  addFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.favoritesService.addFavorite(user.sub, vehicleId);
  }

  @Delete(':vehicleId')
  @ApiOperation({ summary: 'Remove um veículo dos favoritos do usuário autenticado' })
  removeFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.favoritesService.removeFavorite(user.sub, vehicleId);
  }
}
