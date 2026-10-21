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
import { SeedModule } from './seed/seed.module';
import { UploadsModule } from './uploads/uploads.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from './mail/mail.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv, isProductionEnv } from './config/env.validation';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    RedisModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        // In production this is guaranteed by validateEnv (hard fail at boot).
        const uri =
          configService.get<string>('MONGO_URI') ||
          'mongodb://localhost:27017/supameal';
        const maxPoolSize = Number(configService.get('MONGO_MAX_POOL_SIZE')) || 50;
        const minPoolSize = Number(configService.get('MONGO_MIN_POOL_SIZE')) || 2;
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
          maxPoolSize,
          minPoolSize: Math.min(minPoolSize, maxPoolSize),
          maxConnecting: Math.min(4, maxPoolSize),
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
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (configService: ConfigService, redis: RedisService) => {
        const throttler: any = {
          // @nestjs/throttler v6 expects ttl in MILLISECONDS.
          ttl: Number(configService.get('THROTTLE_TTL_MS')) || 60_000,
          limit: Number(configService.get('THROTTLE_LIMIT')) || 100,
        };
        if (redis.isConfigured) throttler.storage = new RedisThrottlerStorage(redis);
        return [throttler];
      },
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
}
