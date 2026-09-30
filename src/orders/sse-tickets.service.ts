import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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
 * single-use and expire in 30 seconds, so a leaked ticket is worthless.
 */
@Injectable()
export class SseTicketsService {
  private readonly tickets = new Map<string, SseTicket>();

  issue(orderId: string, userId: string, userRole: string): string {
    // Bound memory against ticket flooding
    if (this.tickets.size >= 5000) {
      const now = Date.now();
      for (const [k, t] of this.tickets) {
        if (t.expiresAt < now) this.tickets.delete(k);
      }
    }

    const ticket = randomUUID();
    this.tickets.set(ticket, {
      orderId,
      userId,
      userRole,
      expiresAt: Date.now() + TICKET_TTL_MS,
    });
    return ticket;
  }

  /** Validates and burns the ticket — one-time use. */
  consume(ticket: string): SseTicket | null {
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    if (entry.expiresAt < Date.now()) return null;
    return entry;
  }
}
