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
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { PromosModule } from './promos/promos.module';
import { SeedModule } from './seed/seed.module';
import { UploadsModule } from './uploads/uploads.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from './mail/mail.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv, isProductionEnv } from './config/env.validation';

const THROTTLE_TTL_MS = Number(process.env.THROTTLE_TTL_MS) || 60_000; // milliseconds
const THROTTLE_LIMIT = Number(process.env.THROTTLE_LIMIT) || 100;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        // In production this is guaranteed by validateEnv (hard fail at boot).
        const uri =
          configService.get<string>('MONGO_URI') ||
          'mongodb://localhost:27017/supameal';
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
        };
      },
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      global: true,
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          // validateEnv guarantees this in every environment; belt-and-braces.
          throw new Error('JWT_SECRET is not configured — refusing to start');
        }
        return {
          secret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_ACCESS_TTL') || '15m') as any,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => [
        {
          // @nestjs/throttler v6 expects ttl in MILLISECONDS.
          ttl: THROTTLE_TTL_MS,
          limit: THROTTLE_LIMIT,
        },
      ],
    }),
    AuthModule,
    UsersModule,
    RestaurantsModule,
    MenusModule,
    BookingsModule,
    ReviewsModule,
    NotificationsModule,
    PaymentsModule,
    ProfilesModule,
    OrdersModule,
    AdminModule,
    PromosModule,
    MailModule,
    SeedModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  static readonly isProduction = isProductionEnv();
  static readonly throttlerTtlMs = THROTTLE_TTL_MS;
  static readonly throttlerLimit = THROTTLE_LIMIT;
}
