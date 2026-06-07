import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { User, Userschema } from 'src/users/schema/user.schema';
import { order, orderSchema } from 'src/orders/schema/order.schema';
import { bookings, bookingschema } from 'src/bookings/schema/bookings.schema';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from './schema/platform-settings.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: restaurant.name, schema: restaurantSchema },
      { name: User.name, schema: Userschema },
      { name: order.name, schema: orderSchema },
      { name: bookings.name, schema: bookingschema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
    ]),
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
