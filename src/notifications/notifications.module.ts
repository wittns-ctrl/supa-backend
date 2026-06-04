import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  notification,
  notificationschema,
} from './schema/notifications.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: notification.name, schema: notificationschema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
