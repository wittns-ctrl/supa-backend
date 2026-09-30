import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from './schema/order.schema';

export interface OrderEvent {
  orderId: string;
  status: OrderStatus;
  eta?: string;
  updatedAt: string;
}

type OrderListener = (event: OrderEvent) => void;

const MAX_CACHED_EVENTS = 200;

/**
 * In-process pub/sub for order status changes, consumed by the SSE endpoint
 * (GET /orders/:id/stream). `updateStatus` emits here; every connected
 * tracking stream for that order receives the event immediately.
 *
 * Scope note: single-instance deployments. If the API is scaled horizontally,
 * swap the Map for Redis pub/sub — the interface stays the same.
 */
@Injectable()
export class OrderEventsService {
  private readonly logger = new Logger(OrderEventsService.name);
  private readonly subscribers = new Map<string, Set<OrderListener>>();
  private readonly lastEvent = new Map<string, OrderEvent>();

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

  /** Publish a status change and remember it so fresh streams can catch up. */
  emit(orderId: string, status: OrderStatus, eta?: string) {
    const event: OrderEvent = {
      orderId,
      status,
      eta,
      updatedAt: new Date().toISOString(),
    };

    if (this.lastEvent.size >= MAX_CACHED_EVENTS) {
      let n = Math.floor(MAX_CACHED_EVENTS / 2);
      for (const key of this.lastEvent.keys()) {
        if (n-- <= 0) break;
        this.lastEvent.delete(key);
      }
    }
    this.lastEvent.set(orderId, event);

    const set = this.subscribers.get(orderId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        this.logger.warn('Order event listener threw', err as Error);
      }
    }
  }

  /** Last event for an order, for streams that connected mid-flight. */
  lastEventFor(orderId: string): OrderEvent | undefined {
    return this.lastEvent.get(orderId);
  }
}
