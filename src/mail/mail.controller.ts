import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('contact')
  async contact(@Body() dto: CreateMailDto) {
    await this.mailService.sendContactEmail(dto);
    return { message: 'Message sent successfully' };
  }

  @Post('newsletter/subscribe')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  subscribe(@Body() dto: NewsletterSubscribeDto) {
    return this.mailService.subscribeToNewsletter(dto.email);
  }
}
