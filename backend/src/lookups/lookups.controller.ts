import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { LookupsService } from './lookups.service';

@ApiTags('lookups')
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Public()
  @Get('cep/:zipCode')
  @ApiOperation({ summary: 'Consulta endereço por CEP' })
  lookupZipCode(@Param('zipCode') zipCode: string) {
    return this.lookupsService.lookupZipCode(zipCode);
  }

  @Public()
  @Get('geocode')
  @ApiOperation({
    summary: 'Localiza latitude/longitude a partir de um endereço',
  })
  geocodeAddress(@Query('address') address: string) {
    if (!address?.trim()) {
      throw new BadRequestException('Informe o endereço a ser localizado.');
    }
    return this.lookupsService.geocodeAddress(address);
  }

  @Public()
  @Get('fipe/:type/brands')
  @ApiOperation({ summary: 'Lista marcas FIPE por tipo de veículo' })
  getFipeBrands(@Param('type') type: string) {
    this.validateFipeType(type);
    return this.lookupsService.getFipeBrands(type as 'cars' | 'motorcycles');
  }

  @Public()
  @Get('fipe/:type/brands/:brandCode/models')
  @ApiOperation({ summary: 'Lista modelos FIPE por marca' })
  getFipeModels(
    @Param('type') type: string,
    @Param('brandCode') brandCode: string,
  ) {
    this.validateFipeType(type);
    return this.lookupsService.getFipeModels(
      type as 'cars' | 'motorcycles',
      brandCode,
    );
  }

  @Public()
  @Get('fipe/:type/brands/:brandCode/models/:modelCode/years')
  @ApiOperation({ summary: 'Lista anos FIPE por modelo' })
  getFipeYears(
    @Param('type') type: string,
    @Param('brandCode') brandCode: string,
    @Param('modelCode') modelCode: string,
  ) {
    this.validateFipeType(type);
    return this.lookupsService.getFipeYears(
      type as 'cars' | 'motorcycles',
      brandCode,
      modelCode,
    );
  }

  @Public()
  @Get('fipe/:type/brands/:brandCode/models/:modelCode/years/:yearCode')
  @ApiOperation({ summary: 'Consulta preço FIPE com sugestão de taxa semanal' })
  getFipePrice(
    @Param('type') type: string,
    @Param('brandCode') brandCode: string,
    @Param('modelCode') modelCode: string,
    @Param('yearCode') yearCode: string,
  ) {
    this.validateFipeType(type);
    return this.lookupsService.getFipePrice(
      type as 'cars' | 'motorcycles',
      brandCode,
      modelCode,
      yearCode,
    );
  }

  private validateFipeType(type: string): void {
    if (type !== 'cars' && type !== 'motorcycles') {
      throw new BadRequestException(
        'Tipo inválido. Use "cars" ou "motorcycles".',
      );
    }
  }
}
