import { Module } from '@nestjs/common';
import { PromosController } from './promos.controller';

@Module({
  controllers: [PromosController],
})
export class PromosModule {}
