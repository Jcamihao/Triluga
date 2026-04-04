import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { BookingsService } from './bookings.service';
import { BookingDecisionDto } from './dto/booking-decision.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingChecklistDto } from './dto/update-booking-checklist.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma solicitação de reserva' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.sub, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Lista reservas feitas pelo usuário autenticado' })
  getMyBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.getMyBookings(user.sub);
  }

  @Get('owner')
  @ApiOperation({ summary: 'Lista reservas recebidas nos anúncios do usuário autenticado' })
  getOwnerBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.getOwnerBookings(user.sub);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Aprova uma reserva pendente' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Body() dto: BookingDecisionDto,
  ) {
    return this.bookingsService.approve(user.sub, bookingId, dto);
  }

  @Patch(':id/reject')
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

  @Patch(':id/checklists/:type')
  @UseInterceptors(FilesInterceptor('files', 6))
  @ApiOperation({ summary: 'Atualiza o checklist de retirada ou devolução com fotos' })
  updateChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Param('type') type: string,
    @Body() dto: UpdateBookingChecklistDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.bookingsService.updateChecklist(
      user.sub,
      bookingId,
      type,
      dto,
      files ?? [],
    );
  }
}
