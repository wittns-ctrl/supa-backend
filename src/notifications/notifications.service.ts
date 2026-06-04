import { Injectable } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  notification,
  notificationDocument,
} from './schema/notifications.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(notification.name)
    private readonly notificationModel: Model<notificationDocument>,
  ) {}

  create(createNotificationDto: CreateNotificationDto) {
    return 'This action adds a new notification';
  }

  findAll() {
    return `This action returns all notifications`;
  }

  findOne(id: number) {
    return `This action returns a #${id} notification`;
  }

  update(id: number, updateNotificationDto: UpdateNotificationDto) {
    return `This action updates a #${id} notification`;
  }

  remove(id: number) {
    return `This action removes a #${id} notification`;
  }
}
