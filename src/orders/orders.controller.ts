import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { OrderStatus } from './schema/order.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { parsePagination } from 'src/common/utils/pagination.util';
import { userHasRole } from 'src/common/utils/auth-access.util';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(roles.CUSTOMER)
  create(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: { id: string; role: string }) {
    return this.ordersService.create(createOrderDto, user.id, user.role);
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
      return this.ordersService.findAll(customerId, restaurantId, user!.id, role, p, l);
    }
    if (view === 'owner' && userHasRole(user, roles.OWNER)) {
      // Owners are scoped to their own restaurants inside the service.
      return this.ordersService.findAll(customerId, restaurantId, user!.id, roles.OWNER, p, l);
    }
    // Customers are always scoped to their own orders — query params ignored.
    return this.ordersService.findAll(undefined, undefined, user!.id, role, p, l);
  }

  @Get(':id/tracking')
  getTracking(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }) {
    return this.ordersService.getTracking(id, user.id, (user as any).roles?.join(',') ?? user.role);
  }

  @Post(':id/reorder')
  reorder(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.ordersService.reorder(id, user.id);
  }

  @Delete(':id/history')
  @UseGuards(RolesGuard)
  @Roles(roles.CUSTOMER)
  hideFromCustomerHistory(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.ordersService.hideFromCustomerHistory(id, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }) {
    return this.ordersService.findOne(id, user.id, (user as any).roles?.join(',') ?? user.role);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN, roles.CUSTOMER)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.ordersService.updateStatus(id, body.status, user.id, (user as any).roles?.join(',') ?? user.role);
  }
}
