import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import {
  AuthAccountType,
  User,
  UserDocument,
  UserStatus,
  roles,
} from 'src/users/schema/user.schema';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /** Only provisions an explicitly configured admin account; restaurant records are user registered. */
  async onModuleInit() {
    await this.ensurePrimaryAdmin();
  }

  private async ensurePrimaryAdmin() {
    const email = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.DEMO_ADMIN_PASSWORD;
    if (!email || !password) {
      this.logger.warn(
        'No primary admin bootstrap credentials were provided; existing database admin access is unchanged.',
      );
      return;
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('DEMO_ADMIN_PASSWORD cannot exceed 72 UTF-8 bytes.');
    }

    await this.userModel.updateMany(
      {
        accountType: AuthAccountType.ADMIN,
        isPrimaryAdmin: true,
        email: { $ne: email },
      },
      {
        $set: { isPrimaryAdmin: false, authSessions: [] },
        $unset: {
          refreshToken: 1,
          previousRefreshToken: 1,
          previousRefreshTokenExpiresAt: 1,
        },
      },
    );
    const existing = await this.userModel
      .findOne({ email, accountType: AuthAccountType.ADMIN })
      .select('+isPrimaryAdmin');
    if (existing) {
      existing.password = await bcrypt.hash(password, 12);
      existing.role = roles.ADMIN;
      existing.isVerified = true;
      existing.status = UserStatus.ACTIVE;
      existing.isPrimaryAdmin = true;
      // Bootstrap credentials synchronize the database account. Revoke old
      // sessions on startup so no previous admin token survives that sync.
      existing.authSessions = [];
      existing.refreshToken = undefined;
      existing.previousRefreshToken = undefined;
      existing.previousRefreshTokenExpiresAt = undefined;
      await existing.save();
      this.logger.log('Configured admin credentials synchronized.');
      return;
    }

    await this.userModel.create({
      name: 'Admin User',
      email,
      password: await bcrypt.hash(password, 12),
      phone: '1000000001',
      role: roles.ADMIN,
      accountType: AuthAccountType.ADMIN,
      isPrimaryAdmin: true,
      isVerified: true,
      status: UserStatus.ACTIVE,
      restaurantMemberships: [],
      authSessions: [],
    });
    this.logger.log('Configured admin account provisioned.');
  }
}
