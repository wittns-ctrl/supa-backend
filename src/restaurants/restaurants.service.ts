import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { InjectModel } from '@nestjs/mongoose';
import {
  restaurant,
  restaurantDocument,
  RestaurantStatus,
} from './schema/restaurant.schema';
import { Model, Types } from 'mongoose';
import { RestaurantMembershipStatus, User, UserDocument, roles } from 'src/users/schema/user.schema';

/**
 * Escapes user input before interpolation into $regex — prevents ReDoS and
 * regex injection against MongoDB.
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
import { order, orderDocument } from 'src/orders/schema/order.schema';
import { bookings, bookingsDocument } from 'src/bookings/schema/bookings.schema';
import { payment, paymentDocument, Payments } from 'src/payments/schema/payments.schema';
import { menu, menuDocument } from 'src/menus/schema/menu.schema';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectModel(restaurant.name)
    private readonly restaurantModel: Model<restaurantDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(order.name)
    private readonly orderModel: Model<orderDocument>,
    @InjectModel(bookings.name)
    private readonly bookingsModel: Model<bookingsDocument>,
    @InjectModel(payment.name)
    private readonly paymentModel: Model<paymentDocument>,
    @InjectModel(menu.name)
    private readonly menuModel: Model<menuDocument>,
    private readonly mailService: MailService,
  ) {}

  async createRestaurant(createRestdto: CreateRestaurantDto) {
    const user = await this.userModel.findById(createRestdto.ownerId);

    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (user.role === roles.ADMIN) {
      throw new UnauthorizedException('Restaurant owner account is invalid');
    }

    const created = await this.restaurantModel.create({
      name: createRestdto.name,
      description: createRestdto.description,
      ownerId: createRestdto.ownerId,
      location: createRestdto.location,
      phone: createRestdto.phone,
      opening: createRestdto.opening,
      capacity: createRestdto.capacity,
      images: createRestdto.images || [],
      cuisine: createRestdto.cuisine || 'International',
      amenities: createRestdto.amenities || [],
      verificationDocs: createRestdto.verificationDocs || [],
      isApproved: false,
      status: RestaurantStatus.PENDING,
    });

    return this.formatRestaurant(created);
  }

  async createRestaurantForAccount(
    createRestdto: CreateRestaurantDto,
    accountId: string,
  ) {
    const user = await this.userModel.findById(accountId);
    if (!user) throw new NotFoundException('user not found');
    if (user.accountType !== 'owner') {
      throw new UnauthorizedException(
        'Only a signed-in customer or restaurant owner can register a restaurant',
      );
    }

    const restaurant = await this.createRestaurant({
      ...createRestdto,
      ownerId: user._id.toString(),
    });
    user.restaurantMemberships = user.restaurantMemberships || [];
    user.restaurantMemberships.push({
      restaurantId: new Types.ObjectId(restaurant.id),
      role: 'owner',
      status: RestaurantMembershipStatus.PENDING,
    } as any);
    await user.save();
    return {
      ...restaurant,
      ownerAccount: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: roles.CUSTOMER,
        roles: [roles.CUSTOMER],
      },
      applicationStatus: RestaurantMembershipStatus.PENDING,
    };
  }

  async findAll(query: {
    search?: string;
    cuisine?: string;
    location?: string;
    rating?: string;
    approvedOnly?: string;
  }, includeUnapproved = false) {
    const filter: Record<string, unknown> = {};

    if (!includeUnapproved) {
      filter.status = RestaurantStatus.ACTIVE;
      filter.isApproved = true;
    }

    if (query.search) {
      const safe = escapeRegExp(query.search.slice(0, 100));
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { cuisine: { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
      ];
    }

    if (query.cuisine) {
      filter.cuisine = { $regex: escapeRegExp(query.cuisine.slice(0, 100)), $options: 'i' };
    }

    if (query.location) {
      filter['location.city'] = { $regex: escapeRegExp(query.location.slice(0, 100)), $options: 'i' };
    }

    if (query.rating) {
      const rating = Number(query.rating);
      if (!Number.isNaN(rating) && rating >= 0 && rating <= 5) {
        filter.rating = { $gte: rating };
      }
    }

    const restaurants = await this.restaurantModel
      .find(filter)
      .populate('ownerId', 'name email')
      .sort({ createdAt: -1 });

    return restaurants.map((r) => this.formatRestaurant(r));
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid restaurant id');
    }

    const found = await this.restaurantModel
      .findById(id)
      .populate('ownerId', 'name email phone');

    if (!found || found.status !== RestaurantStatus.ACTIVE || !found.isApproved) {
      throw new NotFoundException('Restaurant not found');
    }

    const menuItems = await this.menuModel.find({ restaurant: id });
    return {
      ...this.formatRestaurant(found),
      menu: menuItems.map((m) => this.formatMenuItem(m)),
    };
  }

  async findOneForOwner(id: string, userId: string, userRole?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid restaurant id');
    }
    const found = await this.restaurantModel
      .findById(id)
      .populate('ownerId', 'name email phone');
    if (!found) throw new NotFoundException('Restaurant not found');
    const owner = found.ownerId as unknown as { _id?: Types.ObjectId } | Types.ObjectId;
    const ownerId = owner && typeof owner === 'object' && '_id' in owner
      ? owner._id?.toString()
      : owner?.toString?.();
    if (userRole !== roles.ADMIN && ownerId !== userId) {
      throw new UnauthorizedException('You are not authorized to view this restaurant');
    }
    const menuItems = await this.menuModel.find({ restaurant: id });
    return {
      ...this.formatRestaurant(found),
      menu: menuItems.map((m) => this.formatMenuItem(m)),
    };
  }

  async findByOwner(ownerId: string) {
    const restaurants = await this.restaurantModel.find({ ownerId });
    return restaurants.map((r) => this.formatRestaurant(r));
  }

  async update(id: string, updateRestaurantDto: UpdateRestaurantDto, userId?: string, userRole?: string) {
    const existing = await this.restaurantModel.findById(id);
    if (!existing) throw new NotFoundException('Restaurant not found');
    this.assertOwnerOrAdmin(existing.ownerId, userId, userRole);

    const updated = await this.restaurantModel
      .findByIdAndUpdate(id, updateRestaurantDto, { returnDocument: 'after' })
      .populate('ownerId', 'name email');

    if (!updated) throw new NotFoundException('Restaurant not found');
    return this.formatRestaurant(updated);
  }

  async remove(id: string) {
    const deleted = await this.restaurantModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Restaurant not found');
    return { message: 'Restaurant deleted' };
  }

  async addImages(id: string, images: string[], userId?: string, userRole?: string) {
    const existing = await this.restaurantModel.findById(id);
    if (!existing) throw new NotFoundException('Restaurant not found');
    this.assertOwnerOrAdmin(existing.ownerId, userId, userRole);

    const updated = await this.restaurantModel.findByIdAndUpdate(
      id,
      { $push: { images: { $each: images } } },
      { returnDocument: 'after' },
    );
    if (!updated) throw new NotFoundException('Restaurant not found');
    return this.formatRestaurant(updated);
  }

  async removeImage(id: string, imageUrl: string, userId?: string, userRole?: string) {
    const existing = await this.restaurantModel.findById(id);
    if (!existing) throw new NotFoundException('Restaurant not found');
    this.assertOwnerOrAdmin(existing.ownerId, userId, userRole);

    const updated = await this.restaurantModel.findByIdAndUpdate(
      id,
      { $pull: { images: imageUrl } },
      { returnDocument: 'after' },
    );
    if (!updated) throw new NotFoundException('Restaurant not found');
    return this.formatRestaurant(updated);
  }

  async approve(id: string, approved: boolean, rejectionReason?: string) {
    const update: Partial<restaurant> = {
      isApproved: approved,
      status: approved ? RestaurantStatus.ACTIVE : RestaurantStatus.REJECTED,
    };
    const updated = await this.restaurantModel.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
    });
    if (!updated) throw new NotFoundException('Restaurant not found');
    const owner = await this.userModel.findById(updated.ownerId);
    if (owner) {
      const membership: any = (owner.restaurantMemberships || []).find(
        (entry: any) => entry.restaurantId?.toString() === id,
      );
      if (membership) {
        membership.status = approved
          ? RestaurantMembershipStatus.ACTIVE
          : RestaurantMembershipStatus.REJECTED;
      } else if (approved) {
        owner.restaurantMemberships = owner.restaurantMemberships || [];
        owner.restaurantMemberships.push({
          restaurantId: new Types.ObjectId(id),
          role: 'owner',
          status: RestaurantMembershipStatus.ACTIVE,
        } as any);
      }
      await owner.save();
      await this.mailService.sendRestaurantDecisionEmail(
        owner.email,
        updated.name,
        approved,
        rejectionReason,
      );
    }
    return this.formatRestaurant(updated);
  }

  async setStatus(id: string, status: RestaurantStatus) {
    const update: Partial<restaurant> = { status };
    if (status === RestaurantStatus.ACTIVE) update.isApproved = true;
    if (status === RestaurantStatus.SUSPENDED) update.isApproved = false;

    const updated = await this.restaurantModel.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
    });
    if (!updated) throw new NotFoundException('Restaurant not found');
    const owner = await this.userModel.findById(updated.ownerId);
    const membership: any = owner?.restaurantMemberships?.find(
      (entry: any) => entry.restaurantId?.toString() === id,
    );
    if (owner && membership) {
      membership.status = status === RestaurantStatus.ACTIVE
        ? RestaurantMembershipStatus.ACTIVE
        : status === RestaurantStatus.REJECTED
          ? RestaurantMembershipStatus.REJECTED
          : status === RestaurantStatus.SUSPENDED
            ? RestaurantMembershipStatus.SUSPENDED
            : RestaurantMembershipStatus.PENDING;
      await owner.save();
    }
    return this.formatRestaurant(updated);
  }

  async getAnalyticsOverview(
    id: string,
    userId?: string,
    userRole?: string,
  ) {
    const restaurant = await this.restaurantModel.findById(id);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    this.assertOwnerOrAdmin(restaurant.ownerId, userId, userRole);

    const restaurantId = new Types.ObjectId(id);
    const [orders, bookings] = await Promise.all([
      this.orderModel.find({ restaurantId }).exec(),
      this.bookingsModel.find({ restaurantId }).exec(),
    ]);
    const revenue = orders
      .filter((o) => o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    const todayParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kigali',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const today = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
    const kigaliDate = `${today.year}-${today.month}-${today.day}`;
    const startOfToday = new Date(`${kigaliDate}T00:00:00+02:00`);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const orderIds = orders.map((order) => order._id);
    const paymentWindow = { $gte: startOfToday, $lt: startOfTomorrow };
    const [paymentsReceivedToday, refundsProcessedToday] = orderIds.length
      ? await Promise.all([
          this.paymentModel.find({
            orderId: { $in: orderIds },
            status: Payments.PAID,
            updatedAt: paymentWindow,
          }).select('amount').lean().exec(),
          this.paymentModel.find({
            orderId: { $in: orderIds },
            status: Payments.REFUNDED,
            updatedAt: paymentWindow,
          }).select('amount').lean().exec(),
        ])
      : [[], []];
    const todayRevenue = paymentsReceivedToday.reduce(
      (sum, currentPayment) => sum + Number(currentPayment.amount || 0),
      0,
    ) - refundsProcessedToday.reduce(
      (sum, currentPayment) => sum + Number(currentPayment.amount || 0),
      0,
    );

    return {
      totalOrders: orders.length,
      totalBookings: bookings.length,
      revenue: Math.round(revenue * 100) / 100,
      todayRevenue: Math.round(Math.max(0, todayRevenue) * 100) / 100,
      rating: restaurant.rating || 0,
      pendingOrders: orders.filter((o) => o.status === 'pending').length,
    };
  }

  async getRevenueChart(
    id: string,
    period = 'week',
    userId?: string,
    userRole?: string,
  ) {
    const restaurant = await this.restaurantModel.findById(id);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    this.assertOwnerOrAdmin(restaurant.ownerId, userId, userRole);

    const days = period === 'month' ? 30 : 7;
    const restaurantId = new Types.ObjectId(id);
    const now = new Date();
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
    const startDate = new Date(Date.UTC(
      Number(dateParts.year), Number(dateParts.month) - 1,
      Number(dateParts.day) - days + 1, -2,
    ));

    const pipeline: any[] = [
      {
        $match: {
          restaurantId,
          status: 'delivered',
          updatedAt: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'Africa/Kigali' },
          },
          total: { $sum: { $toDouble: '$total' } },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await this.orderModel.aggregate(pipeline).exec();
    const byDate: Record<string, number> = {};
    for (const r of results) {
      byDate[r._id] = Number(r.total) || 0;
    }

    const data = Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.UTC(
        Number(dateParts.year), Number(dateParts.month) - 1,
        Number(dateParts.day) - days + 1 + i,
      ));
      const key = d.toISOString().slice(0, 10);
      const raw = byDate[key] || 0;
      const label = period === 'month'
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      return {
        label,
        value: Math.round(raw * 100) / 100,
      };
    });

    return data;
  }

  async getPeakHours(
    id: string,
    userId?: string,
    userRole?: string,
  ) {
    const restaurant = await this.restaurantModel.findById(id);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    this.assertOwnerOrAdmin(restaurant.ownerId, userId, userRole);

    const restaurantId = new Types.ObjectId(id);
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orderPipeline: any[] = [
      {
        $match: {
          restaurantId,
          status: { $in: ['delivered', 'accepted', 'preparing', 'ready', 'on-way'] },
          createdAt: { $gte: thirtyDaysAgo, $lte: now },
        },
      },
      {
        $group: {
          _id: { $hour: { date: '$createdAt', timezone: 'Africa/Kigali' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const hourData = await this.orderModel.aggregate(orderPipeline).exec();

    const formatHour = (h: number): string => {
      if (h === 0) return '12 AM';
      if (h < 12) return `${h} AM`;
      if (h === 12) return '12 PM';
      return `${h - 12} PM`;
    };

    const counts = new Map<number, number>(hourData.map((r) => [r._id, Number(r.count || 0)]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour: formatHour(hour),
      count: counts.get(hour) || 0,
    }));
  }

  private assertOwnerOrAdmin(
    ownerId: Types.ObjectId | string | undefined,
    userId?: string,
    userRole?: string,
  ): void {
    if (userRole === roles.ADMIN) return;
    const ownerStr =
      ownerId instanceof Types.ObjectId ? ownerId.toString() : typeof ownerId === 'string' ? ownerId : undefined;
    if (userRole === roles.OWNER && ownerStr && ownerStr === userId) return;
    throw new UnauthorizedException('You are not authorized to modify this restaurant');
  }

  private formatRestaurant(r: restaurantDocument) {
    const obj = r.toObject();
    // After populate, ownerId may be an object, null, or an ObjectId string
    const ownerObj = obj.ownerId as unknown as { name?: string; email?: string; _id?: Types.ObjectId } | null | Types.ObjectId;
    const ownerData = ownerObj && typeof ownerObj === 'object' && 'name' in ownerObj
      ? ownerObj as { name?: string; email?: string; _id?: Types.ObjectId }
      : null;
    const rawOwnerId = ownerObj && typeof ownerObj === 'object' && '_id' in ownerObj
      ? (ownerObj as { _id?: Types.ObjectId })._id?.toString()
      : ownerObj?.toString?.() ?? null;

    return {
      id: obj._id.toString(),
      name: obj.name,
      description: obj.description,
      cuisine: obj.cuisine,
      rating: obj.rating,
      reviews: obj.reviewCount,
      deliveryTime: '25-40 min',
      priceRange: '$$',
      image: obj.images?.[0] || '',
      images: obj.images,
      isPromo: false,
      ownerId: rawOwnerId,
      owner: ownerData?.name || 'Owner',
      location: obj.location,
      address: `${obj.location?.address ?? ''}, ${obj.location?.city ?? ''}`,
      hours: obj.opening,
      opening: obj.opening,
      capacity: obj.capacity,
      phone: obj.phone,
      isApproved: obj.isApproved,
      status: obj.status,
      type: obj.cuisine,
      docs: obj.verificationDocs?.length ? 'Submitted' : 'Pending',
      submitted: obj.createdAt,
      amenities: obj.amenities,
    };
  }

  private formatMenuItem(m: menuDocument) {
    const obj = m.toObject();
    return {
      id: obj._id.toString(),
      name: obj.name,
      desc: obj.description,
      description: obj.description,
      price: obj.price,
      category: obj.category,
      image: obj.image,
      available: obj.isAvailable,
      isAvailable: obj.isAvailable,
      spicy: obj.spicy,
      veg: obj.veg,
    };
  }
}
