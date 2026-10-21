import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { OrderStatus } from './schema/order.schema';

export interface OrderEvent {
  orderId: string;
  status: OrderStatus;
  eta?: string;
  updatedAt: string;
}

type OrderListener = (event: OrderEvent) => void;
const MAX_CACHED_EVENTS = 200;
const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class OrderEventsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OrderEventsService.name);
  private readonly instanceId = randomUUID();
  private readonly subscribers = new Map<string, Set<OrderListener>>();
  private readonly lastEvents = new Map<string, OrderEvent>();
  private redisSubscriber?: Redis;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    if (!this.redis.isConfigured) return;
    this.redisSubscriber = await this.redis.createSubscriber();
    const channel = this.redis.key('orders:events');
    this.redisSubscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel !== channel) return;
      try {
        const envelope = JSON.parse(message) as { origin?: string; event?: OrderEvent };
        if (envelope.origin === this.instanceId || !envelope.event?.orderId) return;
        this.rememberAndDeliver(envelope.event);
      } catch (error) {
        this.logger.warn(`Ignoring malformed Redis order event: ${(error as Error).message}`);
      }
    });
    await this.redisSubscriber.subscribe(channel);
    this.logger.log('Cross-instance order event subscriber ready.');
  }

  subscribe(orderId: string, listener: OrderListener): () => void {
    let set = this.subscribers.get(orderId);
    if (!set) {
      set = new Set();
      this.subscribers.set(orderId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.subscribers.delete(orderId);
    };
  }

  async emit(orderId: string, status: OrderStatus, eta?: string): Promise<void> {
    const event: OrderEvent = { orderId, status, eta, updatedAt: new Date().toISOString() };
    this.rememberAndDeliver(event);
    if (!this.redis.isConfigured) return;

    const eventKey = this.redis.key(`orders:last-event:${orderId}`);
    const channel = this.redis.key('orders:events');
    const envelope = JSON.stringify({ origin: this.instanceId, event });
    try {
      await this.redis.connection.set(eventKey, JSON.stringify(event), 'EX', EVENT_TTL_SECONDS);
      await this.redis.connection.publish(channel, envelope);
    } catch (error) {
      // The order status is persisted in MongoDB; a transient pub/sub failure
      // should not turn a successful status update into a failed API response.
      this.logger.warn(`Could not publish order event: ${(error as Error).message}`);
    }
  }

  async lastEventFor(orderId: string): Promise<OrderEvent | undefined> {
    if (this.redis.isConfigured) {
      try {
        const raw = await this.redis.connection.get(this.redis.key(`orders:last-event:${orderId}`));
        if (raw) return JSON.parse(raw) as OrderEvent;
      } catch (error) {
        this.logger.warn(`Could not load last order event from Redis: ${(error as Error).message}`);
      }
    }
    return this.lastEvents.get(orderId);
  }

  async onApplicationShutdown() {
    if (this.redisSubscriber?.status === 'ready') {
      const channel = this.redis.key('orders:events');
      await this.redisSubscriber.unsubscribe(channel);
    }
  }

  private rememberAndDeliver(event: OrderEvent) {
    if (this.lastEvents.size >= MAX_CACHED_EVENTS && !this.lastEvents.has(event.orderId)) {
      let removeCount = Math.floor(MAX_CACHED_EVENTS / 2);
      for (const key of this.lastEvents.keys()) {
        if (removeCount-- <= 0) break;
        this.lastEvents.delete(key);
      }
    }
    this.lastEvents.set(event.orderId, event);
    const listeners = this.subscribers.get(event.orderId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(`Order event listener threw: ${(error as Error).message}`);
      }
    }
  }
}
