import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete an OAuth round-trip
const MAX_PENDING = 5000; // cap memory against flooding

/**
 * One-time CSRF state for OAuth redirects.
 *
 * The previous implementation stored state on `req.session`, but
 * express-session was never installed, so the value never survived the
 * round-trip through Google/Apple and the check silently no-op'd.
 *
 * This service keeps state server-side in memory (state → expiry), issues a
 * fresh random value per request, and consumes it exactly once on callback —
 * a replayed, forged, or stale state is rejected.
 *
 * Scope note: single-instance deployments. If the API is ever scaled
 * horizontally, back this with Redis/Mongo (the interface stays the same).
 */
@Injectable()
export class OAuthStateService {
  private readonly pending = new Map<string, number>(); // state -> expiresAt

  issue(): string {
    if (this.pending.size >= MAX_PENDING) {
      this.pruneExpired(true);
    }
    const state = randomUUID();
    this.pending.set(state, Date.now() + STATE_TTL_MS);
    return state;
  }

  /** Validates and burns the state — one-time use. */
  consume(state: string): boolean {
    if (!state) return false;
    const expiresAt = this.pending.get(state);
    if (expiresAt === undefined) return false;
    this.pending.delete(state); // always burn, even if expired
    return expiresAt > Date.now();
  }

  private pruneExpired(force = false) {
    const now = Date.now();
    for (const [state, expiresAt] of this.pending) {
      if (expiresAt < now) this.pending.delete(state);
    }
    if (force && this.pending.size >= MAX_PENDING) {
      // Extreme backstop: drop the oldest half so issue() can proceed
      const keys = [...this.pending.keys()].slice(
        0,
        Math.floor(MAX_PENDING / 2),
      );
      for (const k of keys) this.pending.delete(k);
    }
  }
}
