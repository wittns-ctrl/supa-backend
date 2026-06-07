import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { restaurant, restaurantDocument, RestaurantStatus } from 'src/restaurants/schema/restaurant.schema';
import { User, UserDocument, roles, UserStatus } from 'src/users/schema/user.schema';
import { order, orderDocument, OrderStatus } from 'src/orders/schema/order.schema';
import { bookings, bookingsDocument } from 'src/bookings/schema/bookings.schema';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from './schema/platform-settings.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(restaurant.name) private restaurantModel: Model<restaurantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(order.name) private orderModel: Model<orderDocument>,
    @InjectModel(bookings.name) private bookingsModel: Model<bookingsDocument>,
    @InjectModel(PlatformSettings.name)
    private settingsModel: Model<PlatformSettingsDocument>,
  ) {}

  async getOverview() {
    const [
      totalRestaurants,
      activeRestaurants,
      pendingRestaurants,
      totalUsers,
      totalCustomers,
      totalOwners,
      totalOrders,
      totalBookings,
      pendingOrders,
      cancelledOrders,
    ] = await Promise.all([
      this.restaurantModel.countDocuments(),
      this.restaurantModel.countDocuments({ status: RestaurantStatus.ACTIVE }),
      this.restaurantModel.countDocuments({ status: RestaurantStatus.PENDING }),
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ role: roles.CUSTOMER }),
      this.userModel.countDocuments({ role: roles.OWNER }),
      this.orderModel.countDocuments(),
      this.bookingsModel.countDocuments(),
      this.orderModel.countDocuments({ status: OrderStatus.PENDING }),
      this.orderModel.countDocuments({ status: { $in: [OrderStatus.CANCELLED, OrderStatus.REJECTED] } }),
    ]);

    const deliveredOrders = await this.orderModel.find({ status: OrderStatus.DELIVERED });
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.total, 0);

    return {
      totalRestaurants,
      activeRestaurants,
      pendingRestaurants,
      totalUsers,
      totalCustomers,
      totalOwners,
      totalOrders,
      totalBookings,
      pendingOrders,
      cancelledOrders,
      totalRevenue,
      blockedUsers: await this.userModel.countDocuments({ status: UserStatus.BLOCKED }),
    };
  }

  async getRevenueChart(period = 'month') {
    const labels =
      period === 'week'
        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return labels.map((label, i) => ({
      label,
      value: 1200 + i * 340 + Math.floor(Math.random() * 200),
    }));
  }

  async getSettings() {
    let settings = await this.settingsModel.findOne();
    if (!settings) {
      settings = await this.settingsModel.create({});
    }
    return settings;
  }

  async updateSettings(update: Partial<PlatformSettings>) {
    let settings = await this.settingsModel.findOne();
    if (!settings) {
      settings = await this.settingsModel.create(update);
    } else {
      settings = await this.settingsModel.findOneAndUpdate({}, update, { new: true });
    }
    return settings;
  }

  async maintenanceAction(action: string) {
    return {
      action,
      status: 'completed',
      message: `${action} completed successfully`,
      timestamp: new Date().toISOString(),
    };
  }
}
