import { OAuthStateService } from './oauth-state.service';

describe('OAuthStateService', () => {
  let service: OAuthStateService;

  beforeEach(() => {
    service = new OAuthStateService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('issues a state and validates it exactly once', () => {
    const state = service.issue();
    expect(state).toBeTruthy();
    expect(service.consume(state)).toBe(true);
    // one-time use — a replayed state must be rejected
    expect(service.consume(state)).toBe(false);
  });

  it('rejects unknown, empty, and missing states', () => {
    expect(service.consume('totally-made-up-state')).toBe(false);
    expect(service.consume('')).toBe(false);
    expect(
      service.consume(undefined as unknown as string),
    ).toBe(false);
  });

  it('rejects expired states and burns them anyway', () => {
    const state = service.issue();
    // Force expiry by rewinding the stored timestamp
    const pending = (service as unknown as { pending: Map<string, number> })
      .pending;
    pending.set(state, Date.now() - 1);

    expect(service.consume(state)).toBe(false);
    // burned even though it was expired — no window for a second attempt
    expect(pending.has(state)).toBe(false);
  });

  it('issues a distinct state per request', () => {
    const a = service.issue();
    const b = service.issue();
    expect(a).not.toBe(b);
    expect(service.consume(a)).toBe(true);
    expect(service.consume(b)).toBe(true);
  });

  it('consuming one state does not invalidate another', () => {
    const a = service.issue();
    const b = service.issue();
    expect(service.consume(a)).toBe(true);
    expect(service.consume(b)).toBe(true);
  });
});
