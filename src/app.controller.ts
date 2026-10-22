import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/live')
  @Header('Cache-Control', 'no-store')
  getLiveness() {
    return this.appService.getLiveness();
  }

  @Get('health/ready')
  @Header('Cache-Control', 'no-store')
  getReadiness() {
    return this.appService.getReadiness();
  }
}
