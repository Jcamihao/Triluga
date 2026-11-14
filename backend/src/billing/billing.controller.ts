import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateGrantDto } from './dto/create-grant.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingPaymentsService: BillingPaymentsService,
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Lista os planos, limites e preços' })
  plans() {
    return this.billingService.getPlans();
  }

  @Get('me')
  @ApiOperation({ summary: 'Plano efetivo e uso do usuário logado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getMe(user.sub);
  }

  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  @Post('checkout')
  @ApiOperation({ summary: 'Gera o link de checkout de um plano pago' })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingPaymentsService.checkout(user.sub, dto);
  }

  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  @Post('sync')
  @ApiOperation({ summary: 'Reconcilia a assinatura do usuário com o Asaas' })
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.billingPaymentsService.sync(user.sub);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancela a assinatura paga do usuário' })
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.billingPaymentsService.cancel(user.sub);
  }

  @Public()
  @SkipThrottle() // o token é a autenticação; rajada do Asaas não pode receber 429
  @HttpCode(200) // o Asaas documenta 200; sem isso o @Post responde 201
  @Post('webhooks/asaas')
  @ApiOperation({ summary: 'Webhook Asaas — eventos de assinatura' })
  asaasWebhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.billingPaymentsService.processWebhookEvent(token, payload);
  }

  @Get('admin/grants')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Lista concessões de plano' })
  listGrants() {
    return this.billingService.listGrants();
  }

  @Post('admin/grants')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '[Admin] Concede um plano a um usuário pelo e-mail',
  })
  createGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGrantDto,
  ) {
    return this.billingService.createGrant(user.sub, dto);
  }

  @Delete('admin/grants/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Revoga uma concessão' })
  revokeGrant(@Param('id') id: string) {
    return this.billingService.revokeGrant(id);
  }
}
