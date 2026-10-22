import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { Connection } from 'mongoose';
import { RedisService } from './redis/redis.service';

describe('AppService readiness', () => {
  const createService = (
    readyState: number,
    redis: Partial<RedisService> = { isConfigured: false, isReady: false },
  ) =>
    new AppService(
      { readyState } as unknown as Connection,
      redis as RedisService,
    );

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('reports liveness without depending on external services', () => {
    expect(createService(0).getLiveness()).toEqual({ status: 'ok' });
  });

  it('returns unavailable while MongoDB is disconnected', () => {
    const service = createService(0);
    expect(() => service.getReadiness()).toThrow(ServiceUnavailableException);
  });

  it('reports ready when MongoDB is connected and Redis is not configured in development', () => {
    expect(createService(1).getReadiness()).toEqual({
      status: 'ready',
      dependencies: { database: 'connected' },
    });
  });

  it('reports configured Redis as a readiness dependency', () => {
    expect(
      createService(1, { isConfigured: true, isReady: true }).getReadiness(),
    ).toEqual({
      status: 'ready',
      dependencies: { database: 'connected', redis: 'connected' },
    });
  });

  it('returns unavailable when Redis is down in production', () => {
    process.env.NODE_ENV = 'production';
    const service = createService(1, { isConfigured: true, isReady: false });

    expect(() => service.getReadiness()).toThrow(ServiceUnavailableException);
  });
});
