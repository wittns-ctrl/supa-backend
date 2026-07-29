import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { InjectModel } from '@nestjs/mongoose';
import { notification, notificationDocument } from './schema/notifications.schema';
import { Model } from 'mongoose';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(notification.name)
    private notificationModel: Model<notificationDocument>,
  ) {}

  async create(dto: CreateNotificationDto) {
    const created = await this.notificationModel.create({
      ...dto,
      isRead: false,
    });
    return this.format(created);
  }

  async findAll(userId?: string) {
    const filter = userId ? { userId } : {};
    const items = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50);
    return items.map((n) => this.format(n));
  }

  async markRead(id: string, userId: string) {
    const updated = await this.notificationModel.findById(id);
    if (!updated) throw new NotFoundException('Notification not found');

    if (updated.userId.toString() !== userId) {
      throw new UnauthorizedException('You are not authorized to modify this notification');
    }

    updated.isRead = true;
    await updated.save();
    return this.format(updated);
  }

  async remove(id: string, userId: string) {
    const deleted = await this.notificationModel.findById(id);
    if (!deleted) throw new NotFoundException('Notification not found');

    if (deleted.userId.toString() !== userId) {
      throw new UnauthorizedException('You are not authorized to delete this notification');
    }

    await this.notificationModel.findByIdAndDelete(id);
    return { message: 'Notification dismissed' };
  }

  private format(n: notificationDocument) {
    const obj = n.toObject();
    return {
      id: obj._id.toString(),
      userId: obj.userId.toString(),
      title: obj.title,
      message: obj.message,
      isRead: obj.isRead,
      time: obj.createdAt
        ? new Date(obj.createdAt).toLocaleString()
        : 'Just now',
      createdAt: obj.createdAt,
    };
  }
}
