import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RedisService } from './redis/redis.service';
import { isProductionEnv } from './config/env.validation';

@Injectable()
export class AppService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getLiveness() {
    return { status: 'ok' };
  }

  getReadiness() {
    if (this.connection.readyState !== 1) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: { database: 'unavailable' },
      });
    }
    if ((isProductionEnv() || this.redis.isConfigured) && !this.redis.isReady) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: { database: 'connected', redis: 'unavailable' },
      });
    }
    return {
      status: 'ready',
      dependencies: {
        database: 'connected',
        ...(this.redis.isConfigured ? { redis: 'connected' } : {}),
      },
    };
  }
}
