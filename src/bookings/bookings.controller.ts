import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { roles } from 'src/users/schema/user.schema';
import { parsePagination } from 'src/common/utils/pagination.util';
import { userHasRole } from 'src/common/utils/auth-access.util';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(roles.CUSTOMER)
  create(
    @Body() createBookingDto: CreateBookingDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (user.role === roles.CUSTOMER) {
      createBookingDto.customerId = user.id;
    }
    return this.bookingsService.create(createBookingDto);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('restaurantId') restaurantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('view') view?: string,
    @CurrentUser() user?: { id: string; role: string },
  ) {
    const role = user?.role;
    const { page: p, limit: l } = parsePagination({ page, limit });

    if (role === roles.ADMIN) {
      return this.bookingsService.findAll(customerId, restaurantId, user!.id, role, p, l);
    }
    if (view === 'owner' && userHasRole(user, roles.OWNER)) {
      // Owner scoping is enforced in the service (must own the restaurant).
      return this.bookingsService.findAll(customerId, restaurantId, user!.id, roles.OWNER, p, l);
    }
    return this.bookingsService.findAll(undefined, undefined, user!.id, role, p, l);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }) {
    return this.bookingsService.findOne(id, user.id, (user as any).roles?.join(',') ?? user.role);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN, roles.CUSTOMER)
  update(
    @Param('id') id: string,
    @Body() updateBookingDto: UpdateBookingDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.bookingsService.update(id, updateBookingDto, user.id, (user as any).roles?.join(',') ?? user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }) {
    return this.bookingsService.remove(id, user.id, (user as any).roles?.join(',') ?? user.role);
  }

  @Delete(':id/history')
  @UseGuards(RolesGuard)
  @Roles(roles.CUSTOMER)
  removeFromCustomerHistory(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.bookingsService.removeFromCustomerHistory(id, user.id);
  }
}
