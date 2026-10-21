import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private readonly subscribers = new Set<Redis>();
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.prefix = (this.config.get<string>('REDIS_KEY_PREFIX') || 'supameal')
      .trim()
      .replace(/:+$/, '');
  }

  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('REDIS_URL')?.trim());
  }

  get isReady(): boolean {
    return this.client?.status === 'ready';
  }

  key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  get connection(): Redis {
    if (!this.client || this.client.status !== 'ready') {
      throw new ServiceUnavailableException('Shared Redis is unavailable');
    }
    return this.client;
  }

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_URL is required in production');
      }
      this.logger.warn('REDIS_URL is not set; using local development fallbacks.');
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 3000),
    });
    this.client.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
    await this.client.connect();
    this.logger.log('Shared Redis connection ready.');
  }

  async createSubscriber(): Promise<Redis> {
    if (!this.client || this.client.status !== 'ready') {
      throw new ServiceUnavailableException('Shared Redis is unavailable');
    }
    const subscriber = this.client.duplicate({ lazyConnect: true });
    subscriber.on('error', (error) => {
      this.logger.error(`Redis subscriber error: ${error.message}`);
    });
    await subscriber.connect();
    this.subscribers.add(subscriber);
    return subscriber;
  }

  async withLock<T>(key: string, work: () => Promise<T>, ttlMs = 120_000): Promise<T> {
    const client = this.connection;
    const lockKey = this.key(`lock:${key}`);
    const token = randomUUID();
    const waitDeadline = Date.now() + 10_000;

    while (Date.now() < waitDeadline) {
      const acquired = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
      if (acquired === 'OK') {
        try {
          return await work();
        } finally {
          await client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token).catch((error) => {
            this.logger.warn(`Could not release Redis lock: ${error.message}`);
          });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 30 + Math.floor(Math.random() * 40)));
    }

    throw new ServiceUnavailableException('Could not coordinate this operation; please retry.');
  }

  async onApplicationShutdown() {
    await Promise.all(
      [...this.subscribers].map(async (subscriber) => {
        if (subscriber.status === 'ready') await subscriber.quit();
        else subscriber.disconnect();
      }),
    );
    this.subscribers.clear();
    if (this.client?.status === 'ready') await this.client.quit();
    else this.client?.disconnect();
  }
}
