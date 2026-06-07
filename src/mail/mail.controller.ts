import { Controller, Post, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('contact')
  async contact(@Body() dto: CreateMailDto) {
    await this.mailService.sendContactEmail(dto);
    return { message: 'Message sent successfully' };
  }
}
