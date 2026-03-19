import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { BookingsService } from './bookings.service';
import { BookingDecisionDto } from './dto/booking-decision.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(Role.RENTER, Role.OWNER)
  @ApiOperation({ summary: 'Cria uma solicitação de reserva' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.sub, dto);
  }

  @Get('my')
  @Roles(Role.RENTER, Role.OWNER)
  @ApiOperation({ summary: 'Lista reservas feitas pelo usuário autenticado' })
  getMyBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.getMyBookings(user.sub);
  }

  @Get('owner')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Lista reservas recebidas pelo proprietário' })
  getOwnerBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.getOwnerBookings(user.sub);
  }

  @Patch(':id/approve')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Aprova uma reserva pendente' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Body() dto: BookingDecisionDto,
  ) {
    return this.bookingsService.approve(user.sub, bookingId, dto);
  }

  @Patch(':id/reject')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Recusa uma reserva pendente' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Body() dto: BookingDecisionDto,
  ) {
    return this.bookingsService.reject(user.sub, bookingId, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela uma reserva do proprietário ou locatário' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
  ) {
    return this.bookingsService.cancel(user.sub, bookingId);
  }
}
