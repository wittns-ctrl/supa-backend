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
import { User, UserDocument, roles } from 'src/users/schema/user.schema';

/**
 * Escapes user input before interpolation into $regex — prevents ReDoS and
 * regex injection against MongoDB.
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
import { order, orderDocument } from 'src/orders/schema/order.schema';
import { bookings, bookingsDocument } from 'src/bookings/schema/bookings.schema';
import { menu, menuDocument } from 'src/menus/schema/menu.schema';

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
    @InjectModel(menu.name)
    private readonly menuModel: Model<menuDocument>,
  ) {}

  async createRestaurant(createRestdto: CreateRestaurantDto) {
    const user = await this.userModel.findById(createRestdto.ownerId);

    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (user.role !== 'owner') {
      throw new UnauthorizedException('You are not authorized for this action');
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

  async findAll(query: {
    search?: string;
    cuisine?: string;
    location?: string;
    rating?: string;
    approvedOnly?: string;
  }) {
    const filter: Record<string, unknown> = {};

    if (query.approvedOnly !== 'false') {
      filter.isApproved = true;
      filter.status = RestaurantStatus.ACTIVE;
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

    if (!found) throw new NotFoundException('Restaurant not found');

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
      .findByIdAndUpdate(id, updateRestaurantDto, { new: true })
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
      { new: true },
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
      { new: true },
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
      new: true,
    });
    if (!updated) throw new NotFoundException('Restaurant not found');
    return this.formatRestaurant(updated);
  }

  async setStatus(id: string, status: RestaurantStatus) {
    const update: Partial<restaurant> = { status };
    if (status === RestaurantStatus.ACTIVE) update.isApproved = true;
    if (status === RestaurantStatus.SUSPENDED) update.isApproved = false;

    const updated = await this.restaurantModel.findByIdAndUpdate(id, update, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Restaurant not found');
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
    const orders = await this.orderModel.find({ restaurantId });
    const bookings = await this.bookingsModel.find({ restaurantId });
    const revenue = orders
      .filter((o) => o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    return {
      totalOrders: orders.length,
      totalBookings: bookings.length,
      revenue: Math.round(revenue * 100) / 100,
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const pipeline: any[] = [
      {
        $match: {
          restaurantId,
          status: 'delivered',
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
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

    const labels = period === 'month'
      ? Array.from({ length: days }, (_, i) => {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        })
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const data = Array.from({ length: days }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const raw = byDate[key] || 0;
      return {
        label: period === 'month' ? labels[i] : labels[(d.getDay() + 6) % 7],
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
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ];

    const hourData = await this.orderModel.aggregate(orderPipeline).exec();

    const formatHour = (h: number): string => {
      if (h === 0) return '12 AM';
      if (h < 12) return `${h} AM`;
      if (h === 12) return '12 PM';
      return `${h - 12} PM`;
    };

    const result = hourData
      .map((r) => ({ hour: formatHour(r._id), count: Number(r.count || 0) }))
      .filter((r) => r.count > 0);

    if (result.length === 0) {
      return [
        { hour: '11 AM', count: 0 },
        { hour: '12 PM', count: 0 },
        { hour: '6 PM', count: 0 },
        { hour: '7 PM', count: 0 },
      ];
    }
    return result;
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
