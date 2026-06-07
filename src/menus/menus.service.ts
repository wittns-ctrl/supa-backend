import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { InjectModel } from '@nestjs/mongoose';
import { menu, menuDocument } from './schema/menu.schema';
import { Model, Types } from 'mongoose';

@Injectable()
export class MenusService {
  constructor(
    @InjectModel(menu.name)
    private readonly menuModel: Model<menuDocument>,
  ) {}

  async create(createMenuDto: CreateMenuDto) {
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

  async findAll(restaurantId?: string) {
    const filter: Record<string, unknown> = {};
    if (restaurantId) {
      if (!Types.ObjectId.isValid(restaurantId)) {
        throw new BadRequestException('Invalid restaurant id');
      }
      filter.restaurant = restaurantId;
    }
    const items = await this.menuModel.find(filter).sort({ category: 1 });
    return items.map((m) => this.formatMenu(m));
  }

  async findOne(id: string) {
    const item = await this.menuModel.findById(id);
    if (!item) throw new NotFoundException('Menu item not found');
    return this.formatMenu(item);
  }

  async update(id: string, updateMenuDto: UpdateMenuDto) {
    const updated = await this.menuModel.findByIdAndUpdate(id, updateMenuDto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Menu item not found');
    return this.formatMenu(updated);
  }

  async remove(id: string) {
    const deleted = await this.menuModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Menu item not found');
    return { message: 'Menu item deleted' };
  }

  private formatMenu(m: menuDocument) {
    const obj = m.toObject();
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
      rating: 4.5,
      available: obj.isAvailable,
      isAvailable: obj.isAvailable,
      spicy: obj.spicy,
      veg: obj.veg,
    };
  }
}
