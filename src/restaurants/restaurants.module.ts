import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { restaurant, restaurantSchema } from './schema/restaurant.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { User, Userschema } from 'src/users/schema/user.schema';
import { order, orderSchema } from 'src/orders/schema/order.schema';
import { bookings, bookingschema } from 'src/bookings/schema/bookings.schema';
import { menu, menuschema } from 'src/menus/schema/menu.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: restaurant.name, schema: restaurantSchema },
      { name: User.name, schema: Userschema },
      { name: order.name, schema: orderSchema },
      { name: bookings.name, schema: bookingschema },
      { name: menu.name, schema: menuschema },
    ]),
    AuthModule,
  ],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
