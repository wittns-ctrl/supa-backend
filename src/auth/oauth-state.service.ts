import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { OAuthStateRecord } from './schema/oauth-record.schema';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete an OAuth round-trip

export type OAuthRole = 'customer' | 'owner';

/**
 * One-time CSRF state for OAuth redirects.
 *
 * The previous implementation stored state on `req.session`, but
 * express-session was never installed, so the value never survived the
 * round-trip through Google/Apple and the check silently no-op'd.
 *
 * Mongo-backed one-time state works across API instances and is consumed
 * atomically so concurrent callback replays cannot both succeed. The state
 * also remembers which login page started the flow, so errors on the callback
 * return the user to the right place (customer vs. owner login).
 */
@Injectable()
export class OAuthStateService {
  constructor(
    @InjectModel(OAuthStateRecord.name)
    private readonly stateModel: Model<OAuthStateRecord>,
  ) {}

  async issue(role: OAuthRole = 'customer'): Promise<string> {
    const state = randomUUID();
    await this.stateModel.create({
      state,
      role,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    return state;
  }

  /** Validates and burns the state — one-time use. */
  async consume(state: string): Promise<boolean> {
    return (await this.consumeWithRole(state)) !== null;
  }

  /** Like consume(), but also returns the login page that started the flow. */
  async consumeWithRole(state: string): Promise<{ role: OAuthRole } | null> {
    if (!state || typeof state !== 'string') return null;
    const record = await this.stateModel
      .findOneAndDelete({
        state,
        expiresAt: { $gt: new Date() },
      })
      .exec();
    if (!record) return null;
    return { role: record.role === 'owner' ? 'owner' : 'customer' };
  }
}
