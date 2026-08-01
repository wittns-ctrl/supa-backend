import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserStatus } from './schema/user.schema';
import { restaurant, restaurantDocument } from 'src/restaurants/schema/restaurant.schema';
import { order, orderDocument } from 'src/orders/schema/order.schema';
import { bookings, bookingsDocument, reviewsEnums } from 'src/bookings/schema/bookings.schema';
import { review, reviewDocument } from 'src/reviews/schema/review.schema';
import { notification, notificationDocument } from 'src/notifications/schema/notifications.schema';
import * as bcrypt from 'bcryptjs';
import { sanitizeUser } from 'src/common/utils/user-response.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(restaurant.name)
    private readonly restaurantModel: Model<restaurantDocument>,
    @InjectModel(order.name)
    private readonly orderModel: Model<orderDocument>,
    @InjectModel(bookings.name)
    private readonly bookingsModel: Model<bookingsDocument>,
    @InjectModel(review.name)
    private readonly reviewModel: Model<reviewDocument>,
    @InjectModel(notification.name)
    private readonly notificationModel: Model<notificationDocument>,
  ) {}

  async findAll(role?: string, status?: string) {
    const filter: Record<string, unknown> = {};
    if (role) {
      const mappedRole = role === 'owner' || role === 'restaurant_owner' ? 'owner' : role;
      filter.role = mappedRole;
    }
    if (status) filter.status = status;

    const users = await this.userModel.find(filter).select('-password -refreshToken');
    return users.map((u) => this.formatUser(u));
  }

  async findOne(id: string) {
    const user = await this.userModel
      .findById(id)
      .select('-password -refreshToken')
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.password) throw new BadRequestException('No password set for this account (social login). Use the provider to sign in or request a password reset first.');

    const match = await bcrypt.compare(dto.currentPassword, user.password);
    if (!match) throw new UnauthorizedException('Current password is incorrect');

    user.password = await bcrypt.hash(dto.newPassword, 12);
    await user.save();
    return { message: 'Password updated successfully' };
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.userModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  async addFavorite(userId: string, restaurantId: string) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurant id');
    }
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $addToSet: { favorites: restaurantId } },
        { new: true },
      )
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.getFavorites(userId);
  }

  async removeFavorite(userId: string, restaurantId: string) {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $pull: { favorites: restaurantId } },
        { new: true },
      )
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.getFavorites(userId);
  }

  async getFavorites(userId: string) {
    const user = await this.userModel.findById(userId).populate('favorites');
    if (!user) throw new NotFoundException('User not found');

    const favorites = await this.restaurantModel.find({
      _id: { $in: user.favorites },
    });

    return favorites.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      cuisine: r.cuisine,
      rating: r.rating,
      reviews: r.reviewCount,
      deliveryTime: '25-40 min',
      priceRange: '$$',
      image: r.images?.[0] || '',
    }));
  }

  async remove(id: string) {
    const deleted = await this.userModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('User not found');
    return { message: 'User deleted' };
  }

  async getDashboardStats(userId: string) {
    const user = await this.userModel.findById(userId).populate('favorites');
    if (!user) throw new NotFoundException('User not found');

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const totalOrders = await this.orderModel.countDocuments({ customerId: userId });
    const ordersThisMonthCount = await this.orderModel.countDocuments({
      customerId: userId,
      createdAt: { $gte: startOfMonth },
    });

    const bookingFilter: any = {
      customerId: userId,
      status: { $in: [reviewsEnums.PENDING, reviewsEnums.CONFIRMED] },
    };

    const upcomingBookingsCount = await this.bookingsModel.countDocuments(bookingFilter);

    const nextBookingDoc = await this.bookingsModel
      .findOne(bookingFilter)
      .sort({ bookingDate: 1 });

    let nextBookingText = 'None';
    if (nextBookingDoc) {
      const d = new Date(nextBookingDoc.bookingDate);
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
      nextBookingText = `Next: ${dayStr} ${nextBookingDoc.bookingTime}`;
    }

    const favoritesCount = user.favorites ? user.favorites.length : 0;
    const favoriteRestaurants = await this.getFavorites(userId);

    const userReviews = await this.reviewModel.find({ customerId: userId });
    const reviewsCount = userReviews.length;
    let avgRatingGiven: number | string = 0;
    if (reviewsCount > 0) {
      const sum = userReviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
      avgRatingGiven = Number((sum / reviewsCount).toFixed(1));
    } else {
      avgRatingGiven = 'N/A';
    }

    const recentOrdersRaw = await this.orderModel
      .find({ customerId: userId })
      .populate('restaurantId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const STATUS_LABELS: Record<string, string> = {
      pending: 'Order Placed',
      accepted: 'Accepted',
      preparing: 'Preparing',
      ready: 'Ready for Pickup',
      'on-way': 'On the Way',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      rejected: 'Rejected',
    };

    const recentOrders = recentOrdersRaw.map((o) => {
      const rName =
        typeof o.restaurantId === 'object' && o.restaurantId
          ? (o.restaurantId as any).name
          : 'Restaurant';
      const itemsSummary = o.items.map((i) => `${i.qty}x ${i.name}`).join(', ');
      const createdAt = (o as any).createdAt ? new Date((o as any).createdAt) : new Date();
      return {
        id: `#${o._id.toString().slice(-4).toUpperCase()}`,
        rawId: o._id.toString(),
        name: itemsSummary || rName,
        restaurant: rName,
        status: o.status,
        statusLabel: STATUS_LABELS[o.status] || o.status,
        price: `$${o.total.toFixed(2)}`,
        time: createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });

    const upcomingBookingsRaw = await this.bookingsModel
      .find({ customerId: userId })
      .populate('restaurantId', 'name')
      .sort({ createdAt: -1 })
      .limit(3);

    const upcomingBookings = upcomingBookingsRaw.map((b) => {
      const rName =
        typeof b.restaurantId === 'object' && b.restaurantId
          ? (b.restaurantId as any).name
          : 'Restaurant';
      return {
        id: b._id.toString(),
        restaurant: rName,
        date: new Date(b.bookingDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        time: b.bookingTime,
        guests: b.guests,
        status: b.status,
      };
    });

    const notificationsRaw = await this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    const notifications = notificationsRaw.map((n) => {
      const createdAt = (n as any).createdAt ? new Date((n as any).createdAt) : new Date();
      return {
        id: n._id.toString(),
        text: n.message,
        title: n.title,
        time: createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        unread: !n.isRead,
      };
    });

    const activities: Array<{ id: string; user: string; action: string; time: string; avatar: string }> = [];
    if (recentOrders.length > 0) {
      const latestOrder = recentOrders[0];
      activities.push({
        id: `act-order-${latestOrder.rawId}`,
        user: 'You',
        action: `Placed order ${latestOrder.id} (${latestOrder.price})`,
        time: latestOrder.time,
        avatar: 'Y',
      });
    }
    if (upcomingBookings.length > 0) {
      const latestBooking = upcomingBookings[0];
      activities.push({
        id: `act-booking-${latestBooking.id}`,
        user: 'You',
        action: `Booked table at ${latestBooking.restaurant}`,
        time: latestBooking.date,
        avatar: 'B',
      });
    }
    if (favoriteRestaurants.length > 0) {
      activities.push({
        id: `act-fav-${favoriteRestaurants[0].id}`,
        user: 'You',
        action: `Saved ${favoriteRestaurants[0].name} to favorites`,
        time: 'Recently',
        avatar: 'F',
      });
    }
    if (activities.length === 0) {
      activities.push({
        id: 'act-init',
        user: 'System',
        action: 'Account registered & active',
        time: 'Just now',
        avatar: 'S',
      });
    }

    return {
      totalOrders,
      ordersThisMonth: `+${ordersThisMonthCount} this month`,
      upcomingBookingsCount,
      nextBookingText,
      favoritesCount,
      avgRatingGiven,
      reviewsCount,
      recentOrders,
      upcomingBookings,
      favoriteRestaurants,
      notifications,
      activities,
    };
  }

  private formatUser(user: UserDocument) {
    const sanitized = sanitizeUser(user);
    return {
      ...sanitized,
      type: user.role === 'owner' ? 'owner' : user.role,
      joined: (user as UserDocument & { createdAt?: Date }).createdAt
        ? new Date((user as UserDocument & { createdAt?: Date }).createdAt!).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })
        : undefined,
      status: user.status,
    };
  }
}
