import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MenusModule } from './menus/menus.module';
import { BookingsModule } from './bookings/bookings.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ProfilesModule } from './profiles/profiles.module';
import {ConfigModule} from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [AuthModule, 
            UsersModule,  
            RestaurantsModule, 
            MenusModule, 
            BookingsModule, 
            ReviewsModule, 
            NotificationsModule, 
            PaymentsModule, 
            ProfilesModule,
            ConfigModule.forRoot({
              isGlobal: true,
            }),
            MongooseModule.forRoot(process.env.MONGO_URI as string)
          ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
