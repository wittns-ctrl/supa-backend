import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, roles } from 'src/users/schema/user.schema';
import {
  restaurant,
  restaurantDocument,
  RestaurantStatus,
} from 'src/restaurants/schema/restaurant.schema';
import { menu, menuDocument } from 'src/menus/schema/menu.schema';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(restaurant.name) private restaurantModel: Model<restaurantDocument>,
    @InjectModel(menu.name) private menuModel: Model<menuDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.restaurantModel.countDocuments();
    if (count > 0) return;
    await this.seed();
  }

  async seed() {
    const password = await bcrypt.hash('Password123!', 10);

    let admin = await this.userModel.findOne({ email: 'admin@supameal.com' });
    if (!admin) {
      admin = await this.userModel.create({
        name: 'Admin User',
        email: 'admin@supameal.com',
        password,
        phone: 1000000001,
        role: roles.ADMIN,
        isVerified: true,
      });
    }

    let owner = await this.userModel.findOne({ email: 'maria@goldenplate.com' });
    if (!owner) {
      owner = await this.userModel.create({
        name: 'Maria Santos',
        email: 'maria@goldenplate.com',
        password,
        phone: 1000000002,
        role: roles.OWNER,
        isVerified: true,
      });
    }

    let customer = await this.userModel.findOne({ email: 'alex@supameal.com' });
    if (!customer) {
      customer = await this.userModel.create({
        name: 'Alex Johnson',
        email: 'alex@supameal.com',
        password,
        phone: 1000000003,
        role: roles.CUSTOMER,
        isVerified: true,
      });
    }

    const restaurants = [
      {
        name: 'The Golden Plate',
        description: 'Fine dining experience with seasonal ingredients and elegant atmosphere.',
        cuisine: 'Fine Dining',
        location: { address: '123 Gourmet Ave', city: 'Downtown', latitude: 40.71, longitude: -74.0 },
        phone: 2125550101,
        opening: 'Mon-Sun: 11:00 AM - 11:00 PM',
        capacity: 80,
        images: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800'],
        rating: 4.8,
        reviewCount: 342,
        isApproved: true,
        status: RestaurantStatus.ACTIVE,
        ownerId: owner._id,
      },
      {
        name: 'Sushi Master',
        description: 'Authentic Japanese sushi and sashimi prepared by master chefs.',
        cuisine: 'Japanese',
        location: { address: '45 Sakura St', city: 'Uptown', latitude: 40.78, longitude: -73.96 },
        phone: 2125550102,
        opening: 'Tue-Sun: 12:00 PM - 10:00 PM',
        capacity: 50,
        images: ['https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800'],
        rating: 4.9,
        reviewCount: 512,
        isApproved: true,
        status: RestaurantStatus.ACTIVE,
        ownerId: owner._id,
      },
      {
        name: 'Burger Joint',
        description: 'Classic American burgers, fries, and shakes in a casual setting.',
        cuisine: 'American',
        location: { address: '78 Main St', city: 'Downtown', latitude: 40.73, longitude: -74.01 },
        phone: 2125550103,
        opening: 'Mon-Sun: 10:00 AM - 12:00 AM',
        capacity: 60,
        images: ['https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'],
        rating: 4.5,
        reviewCount: 890,
        isApproved: true,
        status: RestaurantStatus.ACTIVE,
        ownerId: owner._id,
      },
    ];

    for (const r of restaurants) {
      const created = await this.restaurantModel.create(r);
      const menuItems = [
        { name: 'Crispy Calamari', description: 'Golden fried rings with sweet chili dip', price: 12, category: 'Starters', image: '🦑', isAvailable: true, spicy: false, veg: false },
        { name: 'Grilled Salmon', description: 'Atlantic salmon, asparagus, lemon butter', price: 26, category: 'Main Course', image: '🐟', isAvailable: true, spicy: false, veg: false },
        { name: 'Truffle Burger', description: 'Black truffle, brioche bun, aged cheddar', price: 18, category: 'Burgers', image: '🍔', isAvailable: true, spicy: false, veg: false },
        { name: 'Chocolate Lava Cake', description: 'Molten centre, vanilla ice cream', price: 10, category: 'Desserts', image: '🍫', isAvailable: true, spicy: false, veg: true },
        { name: 'Mango Lassi', description: 'Fresh mango, yogurt, cardamom', price: 6, category: 'Drinks', image: '🥭', isAvailable: true, spicy: false, veg: true },
      ];
      for (const item of menuItems) {
        await this.menuModel.create({ ...item, restaurant: created._id });
      }
    }

    console.log('Database seeded with demo data');
    console.log('Demo accounts (password: Password123!):');
    console.log('  admin@supameal.com (admin)');
    console.log('  maria@goldenplate.com (owner)');
    console.log('  alex@supameal.com (customer)');
  }
}
