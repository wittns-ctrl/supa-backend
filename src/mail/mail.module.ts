import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { NewsletterSubscriber, NewsletterSubscriberSchema } from './schema/newsletter-subscriber.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: NewsletterSubscriber.name, schema: NewsletterSubscriberSchema }])],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
