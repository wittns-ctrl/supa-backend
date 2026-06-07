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
import * as bcrypt from 'bcryptjs';
import { sanitizeUser } from 'src/common/utils/user-response.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(restaurant.name)
    private readonly restaurantModel: Model<restaurantDocument>,
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
