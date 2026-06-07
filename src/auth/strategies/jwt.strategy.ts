import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserStatus } from 'src/users/schema/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default_secret',
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.userModel.findById(payload.sub).select('-password -refreshToken');
    if (!user) throw new UnauthorizedException('User not found');
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }
    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }
}
