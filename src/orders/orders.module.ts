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
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
