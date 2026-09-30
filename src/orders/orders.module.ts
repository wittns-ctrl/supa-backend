import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { order, orderSchema } from './schema/order.schema';
import { menu, menuschema } from 'src/menus/schema/menu.schema';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { payment, paymentschema } from 'src/payments/schema/payments.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AuthModule } from 'src/auth/auth.module';
import { PromosModule } from 'src/promos/promos.module';
import { OrderEventsService } from './order-events.service';
import { SseTicketsService } from './sse-tickets.service';
import { OrderEventsController } from './order-events.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: order.name, schema: orderSchema },
      { name: menu.name, schema: menuschema },
      { name: restaurant.name, schema: restaurantSchema },
      { name: payment.name, schema: paymentschema },
    ]),
    NotificationsModule,
    AuthModule,
    PromosModule,
  ],
  controllers: [OrdersController, OrderEventsController],
  providers: [OrdersService, OrderEventsService, SseTicketsService],
  exports: [OrdersService, OrderEventsService],
})
export class OrdersModule {}
