import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, Userschema } from './schema/user.schema';
import { AuthModule } from 'src/auth/auth.module';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { order, orderSchema } from 'src/orders/schema/order.schema';
import { bookings, bookingschema } from 'src/bookings/schema/bookings.schema';
import { review, reviewschema } from 'src/reviews/schema/review.schema';
import { notification, notificationschema } from 'src/notifications/schema/notifications.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: Userschema },
      { name: restaurant.name, schema: restaurantSchema },
      { name: order.name, schema: orderSchema },
      { name: bookings.name, schema: bookingschema },
      { name: review.name, schema: reviewschema },
      { name: notification.name, schema: notificationschema },
    ]),
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
