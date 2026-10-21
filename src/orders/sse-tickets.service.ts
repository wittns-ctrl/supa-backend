import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/redis/redis.service';

const TICKET_TTL_MS = 30_000; // one-time, short-lived by design

export interface SseTicket {
  orderId: string;
  userId: string;
  userRole: string;
  expiresAt: number;
}

/**
 * One-time tickets for the SSE tracking stream.
 *
 * EventSource cannot send an Authorization header, so the client first calls
 * POST /orders/:id/ticket with its normal JWT, then opens
 * GET /orders/:id/stream?ticket=<uuid> without credentials. Tickets are
 * single-use and expire in 30 seconds. Configured Redis stores tickets so the
 * ticket can be consumed by any API replica behind the load balancer.
 */
@Injectable()
export class SseTicketsService {
  private readonly tickets = new Map<string, SseTicket>();

  constructor(private readonly redis: RedisService) {}

  async issue(orderId: string, userId: string, userRole: string): Promise<string> {
    // Bound memory against ticket flooding
    if (this.tickets.size >= 5000) {
      const now = Date.now();
      for (const [k, t] of this.tickets) {
        if (t.expiresAt < now) this.tickets.delete(k);
      }
    }

    const ticket = randomUUID();
    const entry: SseTicket = {
      orderId,
      userId,
      userRole,
      expiresAt: Date.now() + TICKET_TTL_MS,
    };
    if (this.redis.isConfigured) {
      const stored = await this.redis.connection.set(
        this.redis.key(`sse-ticket:${ticket}`),
        JSON.stringify(entry),
        'PX',
        TICKET_TTL_MS,
        'NX',
      );
      if (stored !== 'OK') throw new ServiceUnavailableException('Unable to issue order tracking ticket');
    } else {
      this.tickets.set(ticket, entry);
    }
    return ticket;
  }

  /** Validates and burns the ticket — one-time use. */
  async consume(ticket: string): Promise<SseTicket | null> {
    if (this.redis.isConfigured) {
      if (!ticket) return null;
      const raw = await this.redis.connection.eval(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
        1,
        this.redis.key(`sse-ticket:${ticket}`),
      );
      if (typeof raw !== 'string') return null;
      try {
        const entry = JSON.parse(raw) as SseTicket;
        return entry.expiresAt > Date.now() ? entry : null;
      } catch {
        return null;
      }
    }
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    if (entry.expiresAt < Date.now()) return null;
    return entry;
  }
}
