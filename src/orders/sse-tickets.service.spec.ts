import { SseTicketsService } from './sse-tickets.service';

describe('SseTicketsService', () => {
  let service: SseTicketsService;

  beforeEach(() => {
    service = new SseTicketsService({ isConfigured: false } as never);
  });

  it('issues a ticket that validates exactly once', async () => {
    const ticket = await service.issue('order-1', 'user-1', 'customer');
    const entry = await service.consume(ticket);
    expect(entry).not.toBeNull();
    expect(entry!.orderId).toBe('order-1');
    expect(entry!.userId).toBe('user-1');
    // one-time use
    expect(await service.consume(ticket)).toBeNull();
  });

  it('rejects unknown and empty tickets', async () => {
    expect(await service.consume('nope')).toBeNull();
    expect(await service.consume('')).toBeNull();
  });

  it('rejects expired tickets', async () => {
    const ticket = await service.issue('order-1', 'user-1', 'customer');
    // Force expiry by rewinding the stored timestamp
    const tickets = (
      service as unknown as { tickets: Map<string, { expiresAt: number }> }
    ).tickets;
    const entry = tickets.get(ticket);
    entry!.expiresAt = Date.now() - 1;

    expect(await service.consume(ticket)).toBeNull();
    expect(tickets.has(ticket)).toBe(false);
  });
});
