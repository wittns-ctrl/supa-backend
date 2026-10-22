import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('paypal/config')
  @UseGuards(JwtAuthGuard)
  getPaypalConfig() {
    return this.paymentsService.getPaypalConfig();
  }

  @Post('paypal/create-order')
  @UseGuards(JwtAuthGuard)
  createPaypalOrder(
    @Body() body: { orderId: string },
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (!body?.orderId) throw new BadRequestException('orderId is required');
    return this.paymentsService.createPaypalOrder(
      body.orderId,
      user.id,
      user.role,
    );
  }

  @Post('paypal/capture-order')
  @UseGuards(JwtAuthGuard)
  capturePaypalOrder(
    @Body() body: { paypalOrderId: string },
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (!body?.paypalOrderId)
      throw new BadRequestException('paypalOrderId is required');
    return this.paymentsService.capturePaypalOrder(
      body.paypalOrderId,
      user.id,
      user.role,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  findAll(@CurrentUser() user: { id: string; role: string }) {
    return this.paymentsService.findAll(user.id, user.role);
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (user.role === roles.ADMIN)
      return this.paymentsService.findByOrder(orderId);
    throw new BadRequestException('Admin role required');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
