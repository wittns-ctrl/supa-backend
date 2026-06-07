import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/users/schema/user.schema';
import { Model } from 'mongoose';
import { sanitizeUser } from 'src/common/utils/user-response.util';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findOne(userId: string) {
    const user = await this.userModel.findById(userId).select('-password -refreshToken');
    if (!user) throw new NotFoundException('Profile not found');
    return sanitizeUser(user);
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const update: Record<string, unknown> = {};
    if (dto.bio !== undefined || dto.imageurl !== undefined) {
      update.profile = { bio: dto.bio, imageurl: dto.imageurl };
    }
    if (dto.name) update.name = dto.name;
    if (dto.phone) update.phone = dto.phone;

    const user = await this.userModel
      .findByIdAndUpdate(userId, update, { new: true })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('Profile not found');
    return sanitizeUser(user);
  }
}
