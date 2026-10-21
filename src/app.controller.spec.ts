import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getConnectionToken } from '@nestjs/mongoose';
import { RedisService } from './redis/redis.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getConnectionToken(), useValue: { readyState: 1 } },
        {
          provide: RedisService,
          useValue: { isConfigured: false, isReady: false },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  it('reports liveness independently of database readiness', () => {
    expect(appController.getLiveness()).toEqual({ status: 'ok' });
  });

  it('reports readiness when MongoDB is connected', () => {
    expect(appController.getReadiness()).toEqual({
      status: 'ready',
      dependencies: { database: 'connected' },
    });
  });
});
