import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class AppService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  getHello(): string {
    return 'Hello World!';
  }

  getLiveness() {
    return { status: 'ok' };
  }

  getReadiness() {
    if (this.connection.readyState !== 1) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: { database: 'unavailable' },
      });
    }
    return { status: 'ready', dependencies: { database: 'connected' } };
  }
}
