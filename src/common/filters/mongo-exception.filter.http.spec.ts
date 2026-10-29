import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Error as MongooseError } from 'mongoose';
import request from 'supertest';
import { MongoExceptionFilter } from './mongo-exception.filter';

@Controller('probe')
class ProbeController {
  @Get('cast')
  cast() {
    throw new MongooseError.CastError('ObjectId', 'nope', '_id');
  }

  @Get('dup')
  dup() {
    throw Object.assign(new Error('E11000'), { code: 11000 });
  }
}

// Registered exactly the way AppModule does it (APP_FILTER), so this also
// proves BaseExceptionFilter gets its HTTP adapter injected.
describe('MongoExceptionFilter over HTTP (APP_FILTER wiring)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: APP_FILTER, useClass: MongoExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an invalid ObjectId with 400, not 500', async () => {
    const res = await request(app.getHttpServer()).get('/probe/cast');
    expect(res.status).toBe(400);
  });

  it('answers a duplicate key with 409', async () => {
    const res = await request(app.getHttpServer()).get('/probe/dup');
    expect(res.status).toBe(409);
  });
});
