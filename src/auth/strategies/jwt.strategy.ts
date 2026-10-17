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
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      // Never fall back to a default secret — an unconfigured secret would let
      // anyone forge tokens. validateEnv normally catches this at boot.
      throw new Error('JWT_SECRET is not configured — refusing to start');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: string; sid: string; accountType: string }) {
    const user = await this.userModel
      .findById(payload.sub)
      .select('-password -refreshToken -authSessions.refreshTokenHash -authSessions.previousRefreshTokenHash');
    if (!user) throw new UnauthorizedException('User not found');
    if (!payload.accountType || user.accountType !== payload.accountType) {
      throw new UnauthorizedException('Authentication realm mismatch');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }
    const session: any = user.authSessions?.find(
      (entry: any) => entry.sessionId === payload.sid,
    );
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException('Session has been revoked');
    }
    const roles = new Set<string>();
    if (user.accountType === 'customer') roles.add('customer');
    if (user.accountType === 'admin') roles.add('admin');
    if (user.accountType === 'owner') {
      for (const membership of user.restaurantMemberships || []) {
        // Pending or rejected owners can access their private restaurant
        // portal to review/update their application. Public endpoints enforce
        // approval separately before publishing anything.
        if (membership.status === 'active' || membership.status === 'pending' || membership.status === 'rejected') {
          roles.add(membership.role);
        }
      }
    }
    const effectiveRole = roles.has(user.role) ? user.role : [...roles][0] || '';
    return {
      id: user._id.toString(),
      email: user.email,
      role: effectiveRole,
      accountType: user.accountType,
      roles: [...roles],
      restaurantMemberships: (user.restaurantMemberships || []).map((membership: any) => ({
        restaurantId: membership.restaurantId?.toString?.() || membership.restaurantId,
        role: membership.role,
        status: membership.status,
      })),
      name: user.name,
      sessionId: payload.sid,
    };
  }
}
