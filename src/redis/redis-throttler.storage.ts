import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
  local blockedTtl = redis.call('PTTL', KEYS[2])
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  if blockedTtl > 0 then
    return { hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockedTtl }
  end

  local ttl = tonumber(ARGV[1])
  local limit = tonumber(ARGV[2])
  local blockDuration = tonumber(ARGV[3])
  if hits >= limit and redis.call('PTTL', KEYS[1]) > 0 then
    if blockDuration > 0 then
      redis.call('SET', KEYS[2], '1', 'PX', blockDuration)
      redis.call('SET', KEYS[1], '0', 'PX', blockDuration)
      return { hits + 1, blockDuration, 1, blockDuration }
    end
    return { hits + 1, redis.call('PTTL', KEYS[1]), 1, 0 }
  end

  hits = redis.call('INCR', KEYS[1])
  if hits == 1 then redis.call('PEXPIRE', KEYS[1], ttl) end
  local timeToExpire = math.max(redis.call('PTTL', KEYS[1]), 0)
  if hits > limit then
    if blockDuration > 0 then
      redis.call('SET', KEYS[2], '1', 'PX', blockDuration)
      redis.call('SET', KEYS[1], '0', 'PX', blockDuration)
      return { hits, blockDuration, 1, blockDuration }
    end
    return { hits, timeToExpire, 1, 0 }
  end
  return { hits, timeToExpire, 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const safeKey = this.redis.key(`throttle:${throttlerName}:${key}`);
    const blockKey = `${safeKey}:blocked`;
    let raw: Array<number | string>;
    try {
      raw = (await this.redis.connection.eval(
        INCREMENT_SCRIPT,
        2,
        safeKey,
        blockKey,
        String(ttl),
        String(limit),
        String(blockDuration),
      )) as Array<number | string>;
    } catch {
      throw new ServiceUnavailableException(
        'Request protection is temporarily unavailable',
      );
    }

    return {
      totalHits: Number(raw[0]),
      timeToExpire: Math.ceil(Number(raw[1]) / 1000),
      isBlocked: Number(raw[2]) === 1,
      timeToBlockExpire: Math.ceil(Number(raw[3]) / 1000),
    };
  }
}
