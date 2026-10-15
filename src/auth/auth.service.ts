import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/signup-auth.dto';
import { loginAuthDto } from './dto/login-auth.dto';
import { resetAuthDto } from './dto/reset-auth.dto';
import { ForgotAuthDto } from './dto/Forgot.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { roles, User, UserDocument } from '../users/schema/user.schema';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID, createHash, timingSafeEqual } from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { emailverificationDto } from './dto/emailVerification.dto';
import { LogoutAuthDto } from './dto/Logout.dto';
import { sanitizeUser } from 'src/common/utils/user-response.util';

const OTP_MAX_ATTEMPTS = 5;

// #25: the previously-rotated-out refresh token stays valid for this long so
// two tabs (or a lost response) refreshing concurrently don't revoke each
// other. Short window — long enough for races, useless for stolen tokens.
const REFRESH_GRACE_MS = 30_000;
const REFRESH_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

function durationMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const units: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * units[match[2]];
}

function validateBcryptPassword(password: string) {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('Password cannot exceed 72 UTF-8 bytes');
  }
}

function hashToken(token: string): string {
  // SHA-256 is sufficient for high-entropy tokens (OTP digits / UUIDs) and is
  // O(1) lookup in the DB, unlike bcrypt which forces expensive scans.
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly jwtservice: JwtService,
    private readonly mailservice: MailService,
  ) {}

  private normalizeEmail(email: string): string {
    return email ? email.trim().toLowerCase() : '';
  }

  private findUserByEmail(email: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return null;
    return this.userModel.findOne({
      email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i') },
    });
  }

  async createUser(signupdto: CreateAuthDto) {
    const normalizedEmail = this.normalizeEmail(signupdto.email);
    const existingUser = await this.findUserByEmail(normalizedEmail);

    if (existingUser) {
      if (existingUser.isVerified) {
        return { message: 'If this email can be registered, a verification code has been sent.' };
      }
      const salt = await bcrypt.genSalt(10);
      validateBcryptPassword(signupdto.password);
      existingUser.password = await bcrypt.hash(signupdto.password, salt);
      existingUser.name = signupdto.name || existingUser.name;
      existingUser.phone = signupdto.phone ?? existingUser.phone;
      existingUser.role = roles.CUSTOMER;

      const otp = randomInt(100000, 999999).toString();
      const expires = new Date();
      expires.setMinutes(expires.getMinutes() + 5);

      existingUser.emailVerificationOtp = hashToken(otp);
      existingUser.emailVerificationOtpExpires = expires;
      existingUser.emailVerificationOtpAttempts = 0;
      await existingUser.save();

      await this.mailservice.sendOtpEmail(normalizedEmail, otp);
      return { message: 'If this email can be registered, a verification code has been sent.' };
    }

    const salt = await bcrypt.genSalt(10);
    if (!signupdto.password) {
      throw new BadRequestException('Password is required');
    }
    validateBcryptPassword(signupdto.password);
    const hashedPassword = await bcrypt.hash(signupdto.password, salt);

    const otp = randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);

    const role = roles.CUSTOMER;
    const autoVerify = false;

    const user = await this.userModel.create({
      name: signupdto.name,
      email: normalizedEmail,
      password: hashedPassword,
      phone: signupdto.phone,
      role,
      isVerified: autoVerify,
      emailVerificationOtp: autoVerify ? undefined : hashToken(otp),
      emailVerificationOtpExpires: autoVerify ? undefined : expires,
      profile: signupdto.profile,
    });

    if (autoVerify) {
      const tokens = await this.generateTokens(user);
      return {
        message: 'account created successfully',
        ...tokens,
        user: sanitizeUser(user),
      };
    }

    await this.mailservice.sendOtpEmail(normalizedEmail, otp);
    return { message: 'If this email can be registered, a verification code has been sent.' };
  }

  async verifyOtp(VerifyDto: emailverificationDto) {
    const user = await this.findUserByEmail(VerifyDto.email);
    const genericError = 'Invalid or expired verification code';

    if (!user) {
      throw new BadRequestException(genericError);
    }

    if (user.isVerified === true) {
      throw new BadRequestException(genericError);
    }

    if (
      !user.emailVerificationOtp ||
      !user.emailVerificationOtpExpires ||
      user.emailVerificationOtpExpires < new Date()
    ) {
      throw new BadRequestException(genericError);
    }

    // Brute-force protection: limit verification attempts per OTP window
    const attempts = (user.emailVerificationOtpAttempts || 0) + 1;
    if (attempts > OTP_MAX_ATTEMPTS) {
      user.emailVerificationOtp = undefined;
      user.emailVerificationOtpExpires = undefined;
      user.emailVerificationOtpAttempts = 0;
      await user.save();
      throw new BadRequestException(
        'Too many invalid attempts. Please request a new code.',
      );
    }

    const providedHash = hashToken(VerifyDto.otp.trim());
    if (!safeEqualHex(providedHash, user.emailVerificationOtp)) {
      user.emailVerificationOtpAttempts = attempts;
      await user.save();
      throw new BadRequestException(genericError);
    }

    user.emailVerificationOtp = undefined;
    user.emailVerificationOtpExpires = undefined;
    user.emailVerificationOtpAttempts = 0;
    user.isVerified = true;

    await user.save();

    const tokens = await this.generateTokens(user);
    return {
      message: 'email verified successfully',
      ...tokens,
      user: sanitizeUser(user),
    };
  }

  async signin(signinDto: loginAuthDto) {
    const user = await this.findUserByEmail(signinDto.email);

    if (!user) {
      throw new UnauthorizedException('Unable to sign in with these credentials. Check your details and account status.');
    }

      if (user.status === 'blocked') {
      throw new UnauthorizedException('Unable to sign in with these credentials. Check your details and account status.');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Unable to sign in with these credentials. Check your details and account status.');
    }

    if (!user.password) {
      throw new UnauthorizedException('Unable to sign in with these credentials. Check your details and account status.');
    }

    validateBcryptPassword(signinDto.password);

    const isMatch = await bcrypt.compare(signinDto.password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Unable to sign in with these credentials. Check your details and account status.');
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: sanitizeUser(user),
    };
  }

  async resendOtp(email: string) {
    const normalized = this.normalizeEmail(email);
    const user = await this.findUserByEmail(normalized);

    if (!user) {
      return { message: 'If an unverified account exists, a new code has been sent.' };
    }

    if (user.isVerified) {
      return { message: 'If an unverified account exists, a new code has been sent.' };
    }

    const otp = randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);

    user.emailVerificationOtp = hashToken(otp);
    user.emailVerificationOtpExpires = expires;
    user.emailVerificationOtpAttempts = 0;
    await user.save();

    await this.mailservice.sendOtpEmail(normalized, otp);
    return { message: 'If an unverified account exists, a new code has been sent.' };
  }

  /**
   * OAuth Sign-In: Find or create a user from an OAuth provider (Google, Apple, etc.)
   * Identity is pre-verified by the provider — no OTP or password required.
   */
  async oauthSignIn(data: {
    email: string;
    name: string;
    imageurl?: string;
    provider: string;
    providerId: string;
  }) {
    const normalizedEmail = this.normalizeEmail(data.email);
    let user = await this.findUserByEmail(normalizedEmail);

    if (user) {
      // Link OAuth provider if this is their first OAuth login
      if (!user.oauthProvider && user.email.toLowerCase() === normalizedEmail) {
        user.oauthProvider = data.provider;
        user.oauthProviderId = data.providerId;
      }
      if (!user.isVerified) {
        user.isVerified = true;
      }
      // Set profile image from OAuth if user doesn't have one yet
      if (data.imageurl && !user.profile?.imageurl) {
        user.profile = { ...user.profile, imageurl: data.imageurl } as any;
      }
      await user.save();
    } else {
      // Create brand-new OAuth user — auto-verified, no password needed
      user = await this.userModel.create({
        name: data.name,
        email: normalizedEmail,
        role: roles.CUSTOMER,
        isVerified: true,
        oauthProvider: data.provider,
        oauthProviderId: data.providerId,
        profile: data.imageurl ? { imageurl: data.imageurl } : undefined,
      });
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: sanitizeUser(user),
    };
  }

  private async generateTokens(user: UserDocument) {
    const sessionId = randomUUID();
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      sid: sessionId,
    };
      const accessTtl: any = process.env.JWT_ACCESS_TTL || '15m';
    const refreshTtl: any = process.env.JWT_REFRESH_TTL || '7d';
    const refreshSecret = process.env.JWT_REFRESH;
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH is not configured — refusing to issue tokens');
    }
    const refreshtoken = this.jwtservice.sign(payload as any, {
      secret: refreshSecret,
      expiresIn: refreshTtl,
    });

    const hashedrefreshtoken = hashToken(refreshtoken);
    const now = Date.now();
    user.authSessions = (user.authSessions || []).filter((session: any) =>
      new Date(session.expiresAt).getTime() > now,
    ) as any;
    user.authSessions.push({
      sessionId,
      refreshTokenHash: hashedrefreshtoken,
      expiresAt: new Date(now + durationMs(String(refreshTtl), REFRESH_DEFAULT_MS)),
    } as any);
    await user.save();

    const accessToken = this.jwtservice.sign(payload as any, { expiresIn: accessTtl });
    return { accessToken, refreshToken: refreshtoken };
  }

  async ForgotPassword(forgotDto: ForgotAuthDto) {
    const user = await this.findUserByEmail(forgotDto.email);

    const resettoken = randomUUID();

    if (user) {
      const hashedToken = hashToken(resettoken);
      const resettokenExpires = new Date();
      resettokenExpires.setMinutes(resettokenExpires.getMinutes() + 15);

      user.resetToken = hashedToken;
      user.resetTokenExpiration = resettokenExpires;

      await user.save();

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const link = `${frontendUrl}/reset-password?token=${resettoken}`;
      try {
        await this.mailservice.sendResetEmail(forgotDto.email, link);
      } catch (_err) {
        // swallow mail errors so we don't leak enumeration
      }
    }

    return {
      message:
        'If an account exists with this email, a password reset link has been sent.',
    };
  }

  async resetpassword(resetDto: resetAuthDto) {
    // Token is hashed with SHA-256 before lookup → O(1) indexed query instead
    // of scanning and bcrypt-comparing up to 50 candidate rows per request.
    const hashedToken = hashToken(resetDto.token);
    const user = await this.userModel
      .findOne({
        resetToken: hashedToken,
        resetTokenExpiration: { $gt: new Date() },
      })
      .exec();

    if (!user) {
      throw new NotFoundException('Invalid or expired reset link');
    }

    validateBcryptPassword(resetDto.newPassword);
    user.password = await bcrypt.hash(resetDto.newPassword, 12);
    user.resetToken = undefined;
    user.resetTokenExpiration = undefined;
    // A reset link is proof the old credentials are compromised — kill all sessions
    user.authSessions = [];
    user.refreshToken = undefined;
    user.previousRefreshToken = undefined;
    user.previousRefreshTokenExpiresAt = undefined;

    await user.save();

    return { message: 'password reset successfully' };
  }

  async Logout(
    logoutDto: LogoutAuthDto,
    caller?: { id: string; email: string; role: string; sessionId?: string },
  ) {
    let user: UserDocument | null = null;
    if (caller && caller.id) {
      user = await this.userModel.findById(caller.id);
    } else if (logoutDto.email) {
      user = await this.findUserByEmail(logoutDto.email);
    }

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    if (caller?.sessionId) {
      user.authSessions = (user.authSessions || []).filter(
        (session: any) => session.sessionId !== caller.sessionId,
      ) as any;
    } else {
      user.authSessions = [];
    }
    user.refreshToken = undefined;
    await user.save();

    return { message: 'user logged out successfully' };
  }

  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: any;
    try {
      payload = this.jwtservice.verify(refreshToken, {
        secret: process.env.JWT_REFRESH,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub;
    const user = await this.userModel.findById(userId);
    if (!user || !payload.sid || !user.authSessions?.length) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException('Account is blocked');
    }

    // Constant-time comparison of SHA-256 hashes
    const providedHash = hashToken(refreshToken);
    const session: any = user.authSessions.find((entry: any) => entry.sessionId === payload.sid);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    const { iat: _iat, exp: _exp, ...claims } = payload;
    if (!safeEqualHex(providedHash, session.refreshTokenHash)) {
      // Grace window: an in-flight rotation from another tab may still be
      // re-using the just-replaced token. Accept it once and return the
      // current tokens instead of revoking the session.
      if (
        session.previousRefreshTokenHash &&
        session.previousRefreshTokenExpiresAt &&
        new Date(session.previousRefreshTokenExpiresAt).getTime() > Date.now() &&
        safeEqualHex(providedHash, session.previousRefreshTokenHash)
      ) {
        this.logger.debug(
          `Refresh grace period used for user ${user._id} — concurrent refresh absorbed`,
       );
        const accessTtl: any = process.env.JWT_ACCESS_TTL || '15m';
        return {
          accessToken: this.jwtservice.sign(claims as any, {
            expiresIn: accessTtl,
          }),
          refreshToken, // echo the still-graceful token back
          user: sanitizeUser(user),
        };
      }

      user.authSessions = (user.authSessions || []).filter(
        (entry: any) => entry.sessionId !== payload.sid,
      ) as any;
      await user.save().catch(() => undefined);
      throw new UnauthorizedException(
        'Reuse detected — please re-login with your credentials',
      );
    }

    session.previousRefreshTokenHash = session.refreshTokenHash;
    session.previousRefreshTokenExpiresAt = new Date(Date.now() + REFRESH_GRACE_MS);
    const nextRefreshToken = this.jwtservice.sign(claims as any, {
      secret: process.env.JWT_REFRESH,
      expiresIn: (process.env.JWT_REFRESH_TTL || '7d') as any,
    });
    session.refreshTokenHash = hashToken(nextRefreshToken);
    await user.save();
    const accessTtl: any = process.env.JWT_ACCESS_TTL || '15m';
    const accessToken = this.jwtservice.sign(claims as any, { expiresIn: accessTtl });
    return {
      accessToken,
      refreshToken: nextRefreshToken,
      user: sanitizeUser(user),
    };
  }
}
