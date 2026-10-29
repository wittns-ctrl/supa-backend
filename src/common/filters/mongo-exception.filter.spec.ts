import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import { MongoExceptionFilter } from './mongo-exception.filter';

function run(exception: unknown) {
  const reply = jest.fn();
  const filter = new MongoExceptionFilter();
  // BaseExceptionFilter replies through the HTTP adapter
  (filter as unknown as { applicationRef: unknown }).applicationRef = {
    reply,
    isHeadersSent: () => false,
  };
  filter.catch(exception, {
    getArgByIndex: () => ({}),
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => ({}), getRequest: () => ({}) }),
  } as unknown as ArgumentsHost);
  const [, body, status] = reply.mock.calls[0] as [
    unknown,
    { message: unknown },
    number,
  ];
  return { body, status };
}

describe('MongoExceptionFilter', () => {
  it('maps an invalid ObjectId (CastError) to 400 instead of 500', () => {
    const cast = new MongooseError.CastError('ObjectId', 'not-an-id', '_id');
    expect(run(cast).status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps a duplicate-key error to 409', () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
    });
    expect(run(duplicate).status).toBe(HttpStatus.CONFLICT);
  });

  it('leaves Nest HTTP exceptions untouched', () => {
    const teapot = new HttpException(
      'short and stout',
      HttpStatus.I_AM_A_TEAPOT,
    );
    expect(run(teapot).status).toBe(HttpStatus.I_AM_A_TEAPOT);
  });

  it('keeps genuine server faults as 500', () => {
    expect(run(new Error('boom')).status).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
