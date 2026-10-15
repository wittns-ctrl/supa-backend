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
import { User, UserDocument, UserStatus, roles } from './schema/user.schema';
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

  private assertSelfOrAdmin(
    targetId: Types.ObjectId | string,
    userId?: string,
    userRole?: string,
  ): void {
    if (userRole === roles.ADMIN) return;
    const targetStr =
      targetId instanceof Types.ObjectId
        ? targetId.toString()
        : String(targetId);
    if (userId && targetStr === userId) return;
    throw new UnauthorizedException(
      'You are not authorized to access this user',
    );
  }

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

  async findOne(id: string, userId?: string, userRole?: string) {
    this.assertSelfOrAdmin(id, userId, userRole);
    const user = await this.userModel
      .findById(id)
      .select('-password -refreshToken')
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  /**
   * Self-service profile update. The DTO whitelists safe fields only
   * (name/email/phone/deliveryAddress/profile) — role, status and password
   * are structurally impossible to set here (C3 privilege-escalation fix).
   * Email uniqueness is enforced manually since the unique index alone
   * returns an opaque 500 on duplicates.
   */
  async update(id: string, updateUserDto: UpdateUserDto, userId?: string, userRole?: string) {
    this.assertSelfOrAdmin(id, userId, userRole);

    if (updateUserDto.email) {
      const normalized = updateUserDto.email.trim().toLowerCase();
      const existing = await this.userModel.findOne({
        email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
      if (existing && existing._id.toString() !== id) {
        throw new BadRequestException('Email is already in use by another account');
      }
      updateUserDto.email = normalized;
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true, runValidators: true })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  /** Admin-only role assignment — the safe path for promote/demote. */
  async setRole(id: string, role: 'customer' | 'admin') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== role) {
      user.role = role as roles;
      // Access JWTs consult the persisted session on every request, so clearing
      // sessions immediately invalidates existing access and refresh tokens.
      user.authSessions = [];
      user.refreshToken = undefined;
      user.previousRefreshToken = undefined;
      user.previousRefreshTokenExpiresAt = undefined;
      await user.save();
    }
    return this.formatUser(user);
  }

  async changePassword(id: string, dto: ChangePasswordDto, userId?: string, userRole?: string) {
    this.assertSelfOrAdmin(id, userId, userRole);
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.password) throw new BadRequestException('No password set for this account (social login). Use the provider to sign in or request a password reset first.');

    const match = await bcrypt.compare(dto.currentPassword, user.password);
    if (!match) throw new UnauthorizedException('Current password is incorrect');
    if (Buffer.byteLength(dto.newPassword, 'utf8') > 72) {
      throw new BadRequestException('Password cannot exceed 72 UTF-8 bytes');
    }

    user.password = await bcrypt.hash(dto.newPassword, 12);
    // Invalidate all existing sessions — old refresh tokens must not survive a credential change
    user.refreshToken = undefined;
    user.previousRefreshToken = undefined;
    user.previousRefreshTokenExpiresAt = undefined;
    user.authSessions = [];
    await user.save();
    return { message: 'Password updated successfully' };
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.status = status;
    if (status === UserStatus.BLOCKED) user.authSessions = [];
    await user.save();
    return this.formatUser(user);
  }

  async addFavorite(
    targetUserId: string,
    restaurantId: string,
    callerUserId?: string,
    userRole?: string,
  ) {
    this.assertSelfOrAdmin(targetUserId, callerUserId, userRole);
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurant id');
    }
    const user = await this.userModel
      .findByIdAndUpdate(
        targetUserId,
        { $addToSet: { favorites: restaurantId } },
        { new: true },
      )
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.getFavorites(targetUserId, callerUserId, userRole);
  }

  async removeFavorite(
    targetUserId: string,
    restaurantId: string,
    callerUserId?: string,
    userRole?: string,
  ) {
    this.assertSelfOrAdmin(targetUserId, callerUserId, userRole);
    const user = await this.userModel
      .findByIdAndUpdate(
        targetUserId,
        { $pull: { favorites: restaurantId } },
        { new: true },
      )
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.getFavorites(targetUserId, callerUserId, userRole);
  }

  async getFavorites(
    userId: string,
    callerUserId?: string,
    userRole?: string,
  ) {
    this.assertSelfOrAdmin(userId, callerUserId, userRole);
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

  async getDashboardStats(
    userId: string,
    callerUserId?: string,
    userRole?: string,
  ) {
    this.assertSelfOrAdmin(userId, callerUserId, userRole);
    const user = await this.userModel.findById(userId).populate('favorites');
    if (!user) throw new NotFoundException('User not found');

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const visibleOrders = { customerId: userId, hiddenForCustomer: { $ne: true } };
    const totalOrders = await this.orderModel.countDocuments(visibleOrders);
    const ordersThisMonthCount = await this.orderModel.countDocuments({
      ...visibleOrders,
      createdAt: { $gte: startOfMonth },
    });

    const bookingFilter: any = {
      customerId: userId,
      status: { $in: [reviewsEnums.PENDING, reviewsEnums.CONFIRMED] },
      hiddenForCustomer: { $ne: true },
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
    const favoriteRestaurants = await this.getFavorites(userId, callerUserId, userRole);

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
      .find(visibleOrders)
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
      .find({ ...bookingFilter })
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
