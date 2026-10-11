import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateFeaturedOrderDto } from './dto/create-featured-order.dto';
import { FeaturedService } from './featured.service';

@ApiTags('featured')
@Controller('featured')
export class FeaturedController {
  constructor(private readonly featuredService: FeaturedService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Lista planos de destaque disponíveis' })
  getPlans() {
    return this.featuredService.getPlans();
  }

  @Post('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cria pedido de destaque para um veículo' })
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFeaturedOrderDto,
  ) {
    return this.featuredService.createOrder(user.sub, dto);
  }

  @Get('orders/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista pedidos de destaque do usuário autenticado' })
  getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.featuredService.getMyOrders(user.sub);
  }

  @Delete('orders/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancela pedido pendente de destaque' })
  cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
  ) {
    return this.featuredService.cancelOrder(user.sub, orderId);
  }

  @Public()
  @Post('webhook/asaas')
  @ApiOperation({
    summary: 'Webhook Asaas — confirmação de pagamento PIX do destaque',
  })
  handleAsaasWebhook(
    @Headers('asaas-access-token') token: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Body() payload: any,
  ) {
    return this.featuredService.handleAsaasWebhook(token ?? '', payload);
  }
}
