import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
  Headers,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
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

  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  createIntent(
    @Body() body: { orderId: string; metadata?: Record<string, string> },
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (!body?.orderId) throw new BadRequestException('orderId is required');
    return this.paymentsService.createPaymentIntent(
      body.orderId,
      user.id,
      user.role,
      body.metadata || {},
    );
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  confirm(
    @Body() body: { paymentIntentId: string },
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (!body?.paymentIntentId) throw new BadRequestException('paymentIntentId is required');
    // Ownership is enforced inside the service — a user may only confirm
    // payments for their own orders (admins exempt).
    return this.paymentsService.confirmPayment(body.paymentIntentId, user.id, user.role);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: any, @Headers('stripe-signature') signature: string) {
    if (!signature) {
      throw new UnauthorizedException('Missing stripe-signature header');
    }
    const rawBody: Buffer = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available for webhook');
    }
    return this.paymentsService.handleStripeWebhook(signature, rawBody);
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
    // Ownership check would live in a service if this were queried by customers
    if (user.role === roles.ADMIN) {
      return this.paymentsService.findByOrder(orderId);
    }
    throw new UnauthorizedException('Admin role required');
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
