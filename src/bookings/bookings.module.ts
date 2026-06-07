import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { bookingschema, bookings } from './schema/bookings.schema';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { User, Userschema } from 'src/users/schema/user.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: bookings.name, schema: bookingschema },
      { name: restaurant.name, schema: restaurantSchema },
      { name: User.name, schema: Userschema },
    ]),
    NotificationsModule,
    AuthModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
