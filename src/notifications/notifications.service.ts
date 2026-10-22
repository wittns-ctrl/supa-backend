import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { InjectModel } from '@nestjs/mongoose';
import {
  notification,
  notificationDocument,
} from './schema/notifications.schema';
import { Model, Types } from 'mongoose';
import { roles } from 'src/users/schema/user.schema';
import { User, UserDocument } from 'src/users/schema/user.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(notification.name)
    private notificationModel: Model<notificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
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

  async findAllForUser(userId: string, userRole: string) {
    if (userRole === roles.ADMIN) {
      const items = await this.notificationModel
        .find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      const recipientIds = [
        ...new Set(items.map((item) => item.userId.toString())),
      ];
      const recipients = await this.userModel
        .find({ _id: { $in: recipientIds } })
        .select('name email accountType role')
        .lean();
      const recipientById = new Map(
        recipients.map((user) => [user._id.toString(), user]),
      );
      return items.map((item) =>
        this.format(item, recipientById.get(item.userId.toString())),
      );
    }
    const items = await this.notificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50);
    return items.map((n) => this.format(n));
  }

  async markAsRead(id: string, userId: string, userRole: string) {
    const updated = await this.notificationModel.findById(id);
    if (!updated) throw new NotFoundException('Notification not found');

    const ownerId = updated.userId.toString();
    if (userRole !== roles.ADMIN && ownerId !== userId) {
      throw new UnauthorizedException(
        'You are not authorized to modify this notification',
      );
    }

    updated.isRead = true;
    await updated.save();
    return this.format(updated);
  }

  async markAllAsRead(userId: string) {
    // Admins mark only their own notifications here too — a platform-wide
    // "mark everything read" needs an explicit admin endpoint + filter.
    const filter: Record<string, unknown> = { userId, isRead: false };
    await this.notificationModel.updateMany(filter, { isRead: true });
    return { message: 'All notifications marked as read' };
  }

  async update(id: string, dto: UpdateNotificationDto) {
    const updated = await this.notificationModel.findByIdAndUpdate(id, dto, {
      returnDocument: 'after',
    });
    if (!updated) throw new NotFoundException('Notification not found');
    return this.format(updated);
  }

  async remove(id: string, userId: string, userRole: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Notification not found');
    }
    const deleted = await this.notificationModel.findById(id);
    if (!deleted) throw new NotFoundException('Notification not found');

    if (userRole !== roles.ADMIN && deleted.userId.toString() !== userId) {
      throw new UnauthorizedException(
        'You are not authorized to delete this notification',
      );
    }

    await this.notificationModel.findByIdAndDelete(id);
    return { message: 'Notification dismissed' };
  }

  private format(
    n: notificationDocument | Record<string, any>,
    recipient?: Record<string, any>,
  ) {
    const obj =
      typeof (n as notificationDocument).toObject === 'function'
        ? (n as notificationDocument).toObject()
        : n;
    const userRef = obj.userId;
    return {
      id: obj._id.toString(),
      userId: userRef?._id?.toString?.() || userRef.toString(),
      recipient: recipient
        ? {
            id: recipient._id.toString(),
            name: recipient.name,
            email: recipient.email,
            accountType: recipient.accountType || recipient.role,
          }
        : undefined,
      title: obj.title,
      message: obj.message,
      details: obj.details || undefined,
      isRead: obj.isRead,
      time: obj.createdAt
        ? new Date(obj.createdAt).toLocaleString()
        : 'Just now',
      createdAt: obj.createdAt,
    };
  }
}
