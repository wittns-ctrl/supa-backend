import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { InjectModel } from '@nestjs/mongoose';
import { menu, menuDocument } from './schema/menu.schema';
import { restaurant, restaurantDocument, RestaurantStatus } from 'src/restaurants/schema/restaurant.schema';
import { Model, Types } from 'mongoose';
import { roles } from 'src/users/schema/user.schema';

@Injectable()
export class MenusService {
  constructor(
    @InjectModel(menu.name)
    private readonly menuModel: Model<menuDocument>,
    @InjectModel(restaurant.name)
    private readonly restaurantModel: Model<restaurantDocument>,
  ) {}

  private async assertRestaurantOwner(
    restaurantId: Types.ObjectId | string,
    userId?: string,
    userRole?: string,
  ): Promise<void> {
    if (userRole === roles.ADMIN) return;
    if (userRole !== roles.OWNER) {
      throw new UnauthorizedException(
        'You are not authorized to modify this menu',
      );
    }
    const rId =
      restaurantId instanceof Types.ObjectId
        ? restaurantId
        : new Types.ObjectId(restaurantId);
    const found = await this.restaurantModel.findById(rId).select('ownerId').exec();
    if (!found) throw new NotFoundException('Restaurant not found');
    const ownerStr = found.ownerId?.toString();
    if (!ownerStr || userId !== ownerStr) {
      throw new UnauthorizedException(
        'You are not authorized to modify this menu',
      );
    }
  }

  async create(createMenuDto: CreateMenuDto, userId?: string, userRole?: string) {
    await this.assertRestaurantOwner(createMenuDto.restaurant, userId, userRole);
    const created = await this.menuModel.create({
      ...createMenuDto,
      restaurant: createMenuDto.restaurant,
      image: createMenuDto.image || '🍽️',
      isAvailable: createMenuDto.isAvailable ?? true,
      spicy: createMenuDto.spicy ?? false,
      veg: createMenuDto.veg ?? false,
    });
    return this.formatMenu(created);
  }

  async findAll(restaurantId?: string, pageQuery?: string, limitQuery?: string) {
    const requestedPage = pageQuery !== undefined || limitQuery !== undefined;
    const page = Math.max(parseInt(pageQuery || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(limitQuery || (requestedPage ? '20' : '50'), 10) || 50, 1), 100);
    let items: any[];
    let total = 0;

    if (restaurantId) {
      if (!Types.ObjectId.isValid(restaurantId)) throw new BadRequestException('Invalid restaurant id');
      const approved = await this.restaurantModel.exists({
        _id: restaurantId,
        isApproved: true,
        status: RestaurantStatus.ACTIVE,
      });
      if (!approved) return requestedPage
        ? { data: [], pagination: { page, limit, total: 0, totalPages: 0 } }
        : [];
      const filter = { restaurant: new Types.ObjectId(restaurantId) };
      const [rows, count] = await Promise.all([
        this.menuModel.find(filter).sort({ category: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).exec(),
        requestedPage ? this.menuModel.countDocuments(filter).exec() : Promise.resolve(0),
      ]);
      items = rows;
      total = count;
    } else {
      const visibilityStages: any[] = [
        {
          $lookup: {
            from: this.restaurantModel.collection.name,
            let: { restaurantId: '$restaurant' },
            pipeline: [
              { $match: { $expr: { $and: [
                { $eq: ['$_id', '$$restaurantId'] },
                { $eq: ['$isApproved', true] },
                { $eq: ['$status', RestaurantStatus.ACTIVE] },
              ] } } },
              { $project: { _id: 1 } },
            ],
            as: 'visibleRestaurant',
          },
        },
        { $match: { 'visibleRestaurant.0': { $exists: true } } },
      ];
      const [rows, count] = await Promise.all([
        this.menuModel.aggregate([
          ...visibilityStages,
          { $sort: { category: 1, _id: 1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ]).exec(),
        requestedPage
          ? this.menuModel.aggregate([...visibilityStages, { $count: 'total' }]).exec()
          : Promise.resolve([]),
      ]);
      items = rows;
      total = count[0]?.total || 0;
    }

    const data = items.map((m) => this.formatMenu(m));
    return requestedPage
      ? { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      : data;
  }

  async findAllForOwner(restaurantId: string, userId: string, userRole?: string, pageQuery?: string, limitQuery?: string) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurant id');
    }
    await this.assertRestaurantOwner(restaurantId, userId, userRole);
    const requestedPage = pageQuery !== undefined || limitQuery !== undefined;
    const page = Math.max(parseInt(pageQuery || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(limitQuery || (requestedPage ? '20' : '50'), 10) || 50, 1), 100);
    const filter = { restaurant: new Types.ObjectId(restaurantId) };
    const [items, total] = await Promise.all([
      this.menuModel.find(filter).sort({ category: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).exec(),
      requestedPage ? this.menuModel.countDocuments(filter).exec() : Promise.resolve(0),
    ]);
    const data = items.map((m) => this.formatMenu(m));
    return requestedPage
      ? { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      : data;
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid menu id');
    }
    const item = await this.menuModel.findById(id);
    if (!item) throw new NotFoundException('Menu item not found');
    const restaurant = await this.restaurantModel.findOne({
      _id: item.restaurant,
      isApproved: true,
      status: RestaurantStatus.ACTIVE,
    }).select('_id').exec();
    if (!restaurant) throw new NotFoundException('Menu item not found');
    return this.formatMenu(item);
  }

  async update(id: string, updateMenuDto: UpdateMenuDto, userId?: string, userRole?: string) {
    const existing = await this.menuModel.findById(id);
    if (!existing) throw new NotFoundException('Menu item not found');
    await this.assertRestaurantOwner(existing.restaurant, userId, userRole);
    const updated = await this.menuModel.findByIdAndUpdate(id, updateMenuDto, {
      returnDocument: 'after',
    });
    if (!updated) throw new NotFoundException('Menu item not found');
    return this.formatMenu(updated);
  }

  async remove(id: string, userId?: string, userRole?: string) {
    const existing = await this.menuModel.findById(id);
    if (!existing) throw new NotFoundException('Menu item not found');
    await this.assertRestaurantOwner(existing.restaurant, userId, userRole);
    const deleted = await this.menuModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Menu item not found');
    return { message: 'Menu item deleted' };
  }

  private formatMenu(m: menuDocument | Record<string, any>) {
    const obj = typeof (m as menuDocument).toObject === 'function'
      ? (m as menuDocument).toObject()
      : m as Record<string, any>;
    return {
      id: obj._id.toString(),
      restaurantId: obj.restaurant.toString(),
      name: obj.name,
      desc: obj.description,
      description: obj.description,
      price: obj.price,
      category: obj.category,
      image: obj.image,
      emoji: obj.image,
      available: obj.isAvailable,
      isAvailable: obj.isAvailable,
      spicy: obj.spicy,
      veg: obj.veg,
    };
  }
}
