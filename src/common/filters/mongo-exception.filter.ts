import {
  ArgumentsHost,
  Catch,
  ConflictException,
  BadRequestException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Error as MongooseError } from 'mongoose';

/**
 * Turns database errors that are really client mistakes into proper 4xx
 * responses. Without this, an invalid ObjectId in a URL (CastError), a failed
 * schema validation, or a duplicate-key race surfaces as an opaque HTTP 500.
 * Everything else keeps Nest's default handling.
 */
@Catch()
export class MongoExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      return super.catch(exception, host);
    }
    if (exception instanceof MongooseError.CastError) {
      return super.catch(
        new BadRequestException(`Invalid ${exception.path || 'value'}`),
        host,
      );
    }
    if (exception instanceof MongooseError.ValidationError) {
      return super.catch(
        new BadRequestException(
          Object.values(exception.errors).map((error) => error.message),
        ),
        host,
      );
    }
    const code = (exception as { code?: number } | null)?.code;
    if (code === 11000) {
      return super.catch(
        new ConflictException('A record with these details already exists'),
        host,
      );
    }
    this.log.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    return super.catch(exception, host);
  }
}
