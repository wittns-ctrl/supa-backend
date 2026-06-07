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
import { User, UserDocument } from 'src/users/schema/user.schema';
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
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { cuisine: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }

    if (query.cuisine) {
      filter.cuisine = { $regex: query.cuisine, $options: 'i' };
    }

    if (query.location) {
      filter['location.city'] = { $regex: query.location, $options: 'i' };
    }

    if (query.rating) {
      filter.rating = { $gte: Number(query.rating) };
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

  async update(id: string, updateRestaurantDto: UpdateRestaurantDto) {
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

  async addImages(id: string, images: string[]) {
    const updated = await this.restaurantModel.findByIdAndUpdate(
      id,
      { $push: { images: { $each: images } } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Restaurant not found');
    return this.formatRestaurant(updated);
  }

  async removeImage(id: string, imageUrl: string) {
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

  async getAnalyticsOverview(id: string) {
    const restaurantId = new Types.ObjectId(id);
    const orders = await this.orderModel.find({ restaurantId });
    const bookings = await this.bookingsModel.find({ restaurantId });
    const revenue = orders
      .filter((o) => o.status === 'delivered')
      .reduce((sum, o) => sum + o.total, 0);

    return {
      totalOrders: orders.length,
      totalBookings: bookings.length,
      revenue,
      rating: (await this.restaurantModel.findById(id))?.rating || 0,
      pendingOrders: orders.filter((o) => o.status === 'pending').length,
    };
  }

  async getRevenueChart(id: string, period = 'week') {
    const days = period === 'month' ? 30 : 7;
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = labels.map((label, i) => ({
      label,
      value: Math.floor(Math.random() * 500) + 100 + i * 20,
    }));
    return data.slice(0, period === 'month' ? 30 : 7);
  }

  async getPeakHours(id: string) {
    return [
      { hour: '11 AM', count: 12 },
      { hour: '12 PM', count: 28 },
      { hour: '1 PM', count: 35 },
      { hour: '6 PM', count: 42 },
      { hour: '7 PM', count: 55 },
      { hour: '8 PM', count: 48 },
    ];
  }

  private formatRestaurant(r: restaurantDocument) {
    const obj = r.toObject();
    const owner = obj.ownerId as unknown as { name?: string; email?: string };
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
      ownerId: typeof obj.ownerId === 'object' ? (obj.ownerId as { _id: Types.ObjectId })._id?.toString() : obj.ownerId?.toString(),
      owner: owner?.name || 'Owner',
      location: obj.location,
      address: `${obj.location?.address}, ${obj.location?.city}`,
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
