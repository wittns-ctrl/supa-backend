import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto';
import { NewsletterUpdateDto } from './dto/newsletter-update.dto';

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

  @Post('newsletter/unsubscribe')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  unsubscribe(@Body() body: { token: string }) {
    return this.mailService.unsubscribeFromNewsletter(body.token);
  }

  @Post('newsletter/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  sendNewsletter(@Body() dto: NewsletterUpdateDto) {
    return this.mailService.sendNewsletterUpdate(dto);
  }
}
