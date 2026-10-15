import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { OAuthStateRecord } from './schema/oauth-record.schema';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete an OAuth round-trip

/**
 * One-time CSRF state for OAuth redirects.
 *
 * The previous implementation stored state on `req.session`, but
 * express-session was never installed, so the value never survived the
 * round-trip through Google/Apple and the check silently no-op'd.
 *
 * Mongo-backed one-time state works across API instances and is consumed
 * atomically so concurrent callback replays cannot both succeed.
 */
@Injectable()
export class OAuthStateService {
  constructor(
    @InjectModel(OAuthStateRecord.name)
    private readonly stateModel: Model<OAuthStateRecord>,
  ) {}

  async issue(): Promise<string> {
    const state = randomUUID();
    await this.stateModel.create({ state, expiresAt: new Date(Date.now() + STATE_TTL_MS) });
    return state;
  }

  /** Validates and burns the state — one-time use. */
  async consume(state: string): Promise<boolean> {
    if (!state) return false;
    const record = await this.stateModel.findOneAndDelete({
      state,
      expiresAt: { $gt: new Date() },
    }).exec();
    return Boolean(record);
  }
}
