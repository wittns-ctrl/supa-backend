import { Controller, Post, Body } from '@nestjs/common';

@Controller('promos')
export class PromosController {
  @Post('validate')
  validate(@Body() body: { code: string }) {
    const code = body.code?.toUpperCase();
    if (code === 'SUPA10') {
      return { valid: true, discount: 5, code: 'SUPA10', message: '10% discount applied ($5 off)' };
    }
    return { valid: false, discount: 0, message: 'Invalid promo code' };
  }
}
