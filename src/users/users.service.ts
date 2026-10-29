import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuthAccountType,
  RestaurantMembershipStatus,
  User,
  UserDocument,
  UserStatus,
  roles,
} from './schema/user.schema';
import {
  restaurant,
  restaurantDocument,
  RestaurantStatus,
} from 'src/restaurants/schema/restaurant.schema';
import { order, orderDocument } from 'src/orders/schema/order.schema';
import {
  bookings,
  bookingsDocument,
  reviewsEnums,
} from 'src/bookings/schema/bookings.schema';
import { review, reviewDocument } from 'src/reviews/schema/review.schema';
import {
  notification,
  notificationDocument,
} from 'src/notifications/schema/notifications.schema';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sanitizeUser } from 'src/common/utils/user-response.util';
import { CreateAuthDto } from 'src/auth/dto/signup-auth.dto';

@Injectable()
export class UsersService implements OnModuleInit {
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

  async onModuleInit() {
    // Replace the legacy email-only unique index with one account per email
    // and auth realm. This is idempotent and keeps existing customer/admin
    // accounts available while splitting old restaurant memberships.
    await this.userModel.collection.dropIndex('email_1').catch(() => undefined);
    await this.userModel.collection.createIndex(
      { email: 1, accountType: 1 },
      { unique: true, name: 'email_account_type_unique' },
    );

    const users = await this.userModel.find({
      $or: [{ accountType: { $exists: false } }, { accountType: null }],
    });
    for (const user of users) {
      const legacyRole = user.role;
      user.accountType =
        legacyRole === roles.ADMIN
          ? AuthAccountType.ADMIN
          : legacyRole === roles.OWNER
            ? AuthAccountType.OWNER
            : AuthAccountType.CUSTOMER;

      const oldMemberships = [...(user.restaurantMemberships || [])] as any[];
      if (
        user.accountType === AuthAccountType.CUSTOMER &&
        oldMemberships.length
      ) {
        let owner = await this.userModel.findOne({
          email: user.email,
          accountType: AuthAccountType.OWNER,
        });
        if (!owner) {
          const source = user.toObject() as any;
          delete source._id;
          delete source.__v;
          delete source.createdAt;
          delete source.updatedAt;
          const initialPassword = await bcrypt.hash(
            randomBytes(32).toString('hex'),
            12,
          );
          owner = await this.userModel.create({
            ...source,
            password: initialPassword,
            role: roles.OWNER,
            accountType: AuthAccountType.OWNER,
            restaurantMemberships: oldMemberships,
            authSessions: [],
            refreshToken: undefined,
            previousRefreshToken: undefined,
            previousRefreshTokenExpiresAt: undefined,
            resetToken: undefined,
            resetTokenExpiration: undefined,
            emailVerificationOtp: undefined,
            emailVerificationOtpExpires: undefined,
            emailVerificationOtpAttempts: 0,
          });
        } else {
          const existingRestaurantIds = new Set(
            (owner.restaurantMemberships || []).map((entry: any) =>
              entry.restaurantId?.toString(),
            ),
          );
          owner.restaurantMemberships = [
            ...(owner.restaurantMemberships || []),
            ...oldMemberships.filter(
              (entry) =>
                !existingRestaurantIds.has(entry.restaurantId?.toString()),
            ),
          ] as any;
          owner.authSessions = [];
          await owner.save();
        }
        await this.restaurantModel.updateMany(
          { ownerId: user._id },
          { $set: { ownerId: owner._id } },
        );
        user.restaurantMemberships = [];
        user.authSessions = [];
      }

      if (
        user.accountType === AuthAccountType.OWNER &&
        !user.restaurantMemberships?.length
      ) {
        const owned = await this.restaurantModel.find({ ownerId: user._id });
        user.restaurantMemberships = owned.map((restaurant) => ({
          restaurantId: restaurant._id,
          role: roles.OWNER,
          status:
            restaurant.status === RestaurantStatus.ACTIVE &&
            restaurant.isApproved
              ? RestaurantMembershipStatus.ACTIVE
              : restaurant.status === RestaurantStatus.REJECTED
                ? RestaurantMembershipStatus.REJECTED
                : restaurant.status === RestaurantStatus.SUSPENDED
                  ? RestaurantMembershipStatus.SUSPENDED
                  : RestaurantMembershipStatus.PENDING,
        }));
      }

      await user.save();
    }
  }

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

  async findAll(
    role?: string,
    status?: string,
    pageQuery?: string,
    limitQuery?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (role) {
      const mappedRole =
        role === 'owner' || role === 'restaurant_owner' ? 'owner' : role;
      filter.accountType = mappedRole;
    }
    if (status) filter.status = status;

    // Previously unbounded: one request pulled every user (and every embedded
    // auth session) into memory. Bound it, and let callers opt in to paging.
    const requestedPage = pageQuery !== undefined || limitQuery !== undefined;
    const page = Math.max(parseInt(pageQuery || '1', 10) || 1, 1);
    const limit = Math.min(
      Math.max(
        parseInt(limitQuery || (requestedPage ? '20' : '500'), 10) || 500,
        1,
      ),
      500,
    );
    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password -refreshToken -authSessions')
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      requestedPage
        ? this.userModel.countDocuments(filter).exec()
        : Promise.resolve(0),
    ]);
    const data = users.map((u) => this.formatUser(u));
    return requestedPage
      ? {
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        }
      : data;
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
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    userId?: string,
    userRole?: string,
  ) {
    this.assertSelfOrAdmin(id, userId, userRole);

    if (updateUserDto.email) {
      const account = await this.userModel.findById(id).select('accountType');
      if (!account) throw new NotFoundException('User not found');
      const normalized = updateUserDto.email.trim().toLowerCase();
      const existing = await this.userModel.findOne({
        accountType: account.accountType,
        email: {
          $regex: new RegExp(
            `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        },
      });
      if (existing && existing._id.toString() !== id) {
        throw new BadRequestException(
          'Email is already in use by another account',
        );
      }
      updateUserDto.email = normalized;
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, {
        returnDocument: 'after',
        runValidators: true,
      })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  /** Customer accounts remain customer accounts; admin accounts are separate records. */
  async setRole(id: string, role: 'customer') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.accountType !== AuthAccountType.CUSTOMER) {
      throw new BadRequestException(
        'Only customer accounts can be demoted through this endpoint',
      );
    }
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

  async createAdminAccount(dto: CreateAuthDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userModel.findOne({
      email,
      accountType: AuthAccountType.ADMIN,
    });
    if (existing)
      throw new BadRequestException(
        'An administrator account already exists for this email',
      );
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Password cannot exceed 72 UTF-8 bytes');
    }
    const user = await this.userModel.create({
      name: dto.name,
      email,
      phone: dto.phone,
      password: await bcrypt.hash(dto.password, 12),
      role: roles.ADMIN,
      accountType: AuthAccountType.ADMIN,
      isVerified: true,
      status: UserStatus.ACTIVE,
      restaurantMemberships: [],
      authSessions: [],
    });
    return this.formatUser(user);
  }

  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    userId?: string,
    userRole?: string,
  ) {
    this.assertSelfOrAdmin(id, userId, userRole);
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.password)
      throw new BadRequestException(
        'No password set for this account (social login). Use the provider to sign in or request a password reset first.',
      );

    const match = await bcrypt.compare(dto.currentPassword, user.password);
    if (!match)
      throw new UnauthorizedException('Current password is incorrect');
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
    const visibleRestaurant = await this.restaurantModel
      .findOne({
        _id: restaurantId,
        isApproved: true,
        status: RestaurantStatus.ACTIVE,
      })
      .select('_id')
      .exec();
    if (!visibleRestaurant) throw new NotFoundException('Restaurant not found');
    const user = await this.userModel
      .findByIdAndUpdate(
        targetUserId,
        { $addToSet: { favorites: restaurantId } },
        { returnDocument: 'after' },
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
        { returnDocument: 'after' },
      )
      .populate('favorites');
    if (!user) throw new NotFoundException('User not found');
    return this.getFavorites(targetUserId, callerUserId, userRole);
  }

  async getFavorites(userId: string, callerUserId?: string, userRole?: string) {
    this.assertSelfOrAdmin(userId, callerUserId, userRole);
    const user = await this.userModel.findById(userId).populate('favorites');
    if (!user) throw new NotFoundException('User not found');

    const favorites = await this.restaurantModel.find({
      _id: { $in: user.favorites },
      isApproved: true,
      status: RestaurantStatus.ACTIVE,
    });

    return favorites.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      cuisine: r.cuisine,
      rating: r.rating,
      reviews: r.reviewCount,
      deliveryTime: '25-40 min',
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

    const visibleOrders = {
      customerId: userId,
      hiddenForCustomer: { $ne: true },
    };
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

    const upcomingBookingsCount =
      await this.bookingsModel.countDocuments(bookingFilter);

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
    const favoriteRestaurants = await this.getFavorites(
      userId,
      callerUserId,
      userRole,
    );

    const userReviews = await this.reviewModel.find({ customerId: userId });
    const reviewsCount = userReviews.length;
    let avgRatingGiven: number | string = 0;
    if (reviewsCount > 0) {
      const sum = userReviews.reduce(
        (acc, r) => acc + Number(r.rating || 0),
        0,
      );
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
      const createdAt = (o as any).createdAt
        ? new Date((o as any).createdAt)
        : new Date();
      return {
        id: `#${o._id.toString().slice(-4).toUpperCase()}`,
        rawId: o._id.toString(),
        name: itemsSummary || rName,
        restaurant: rName,
        status: o.status,
        statusLabel: STATUS_LABELS[o.status] || o.status,
        price: `$${o.total.toFixed(2)}`,
        time: createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
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
        date: new Date(b.bookingDate).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
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
      const createdAt = (n as any).createdAt
        ? new Date((n as any).createdAt)
        : new Date();
      return {
        id: n._id.toString(),
        text: n.message,
        title: n.title,
        time: createdAt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        unread: !n.isRead,
      };
    });

    const activities: Array<{
      id: string;
      user: string;
      action: string;
      time: string;
      avatar: string;
    }> = [];
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
        ? new Date(
            (user as UserDocument & { createdAt?: Date }).createdAt!,
          ).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })
        : undefined,
      status: user.status,
    };
  }
}
