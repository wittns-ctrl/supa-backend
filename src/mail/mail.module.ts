import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { NewsletterSubscriber, NewsletterSubscriberSchema } from './schema/newsletter-subscriber.schema';
import { User, Userschema } from 'src/users/schema/user.schema';
import { notification, notificationschema } from 'src/notifications/schema/notifications.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: NewsletterSubscriber.name, schema: NewsletterSubscriberSchema },
    { name: User.name, schema: Userschema },
    { name: notification.name, schema: notificationschema },
  ])],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
