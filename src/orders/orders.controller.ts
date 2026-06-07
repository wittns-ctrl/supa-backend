import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { OrderStatus } from './schema/order.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('customerId') customerId?: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    return this.ordersService.findAll(customerId, restaurantId);
  }

  @Get(':id/tracking')
  @UseGuards(JwtAuthGuard)
  getTracking(@Param('id') id: string) {
    return this.ordersService.getTracking(id);
  }

  @Post(':id/reorder')
  @UseGuards(JwtAuthGuard)
  reorder(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.ordersService.reorder(id, user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    return this.ordersService.updateStatus(id, body.status);
  }
}
