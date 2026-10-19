import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { notification, notificationschema } from './schema/notifications.schema';
import { AuthModule } from 'src/auth/auth.module';
import { User, Userschema } from 'src/users/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: notification.name, schema: notificationschema },
      { name: User.name, schema: Userschema },
    ]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
