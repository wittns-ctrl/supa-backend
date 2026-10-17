import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument, roles } from 'src/users/schema/user.schema';
import { Model, Types } from 'mongoose';
import { sanitizeUser } from 'src/common/utils/user-response.util';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

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
      'You are not authorized to access this profile',
    );
  }

  async findOne(userId: string, callerId?: string, userRole?: string) {
    this.assertSelfOrAdmin(userId, callerId, userRole);
    const user = await this.userModel.findById(userId).select('-password -refreshToken');
    if (!user) throw new NotFoundException('Profile not found');
    return sanitizeUser(user);
  }

  async update(userId: string, dto: UpdateProfileDto, callerId?: string, userRole?: string) {
    this.assertSelfOrAdmin(userId, callerId, userRole);
    const update: Record<string, unknown> = {};
    if (dto.bio !== undefined || dto.imageurl !== undefined) {
      update.profile = { bio: dto.bio, imageurl: dto.imageurl };
    }
    if (dto.name) update.name = dto.name;
    if (dto.phone) update.phone = dto.phone;

    const user = await this.userModel
      .findByIdAndUpdate(userId, update, { returnDocument: 'after' })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('Profile not found');
    return sanitizeUser(user);
  }
}
