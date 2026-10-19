import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

describe('AppService readiness', () => {
  it('returns unavailable while MongoDB is disconnected', () => {
    const service = new AppService({ readyState: 0 } as any);
    expect(() => service.getReadiness()).toThrow(ServiceUnavailableException);
  });
});
