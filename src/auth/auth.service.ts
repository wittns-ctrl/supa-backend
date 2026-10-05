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
import { mapFrontendRole, sanitizeUser } from 'src/common/utils/user-response.util';

const OTP_MAX_ATTEMPTS = 5;

// #25: the previously-rotated-out refresh token stays valid for this long so
// two tabs (or a lost response) refreshing concurrently don't revoke each
// other. Short window — long enough for races, useless for stolen tokens.
const REFRESH_GRACE_MS = 30_000;

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
        throw new BadRequestException('User already exists');
      }
      const salt = await bcrypt.genSalt(10);
      existingUser.password = await bcrypt.hash(signupdto.password, salt);
      existingUser.name = signupdto.name || existingUser.name;
      existingUser.phone = signupdto.phone ?? existingUser.phone;

      const otp = randomInt(100000, 999999).toString();
      const expires = new Date();
      expires.setMinutes(expires.getMinutes() + 5);

      existingUser.emailVerificationOtp = hashToken(otp);
      existingUser.emailVerificationOtpExpires = expires;
      existingUser.emailVerificationOtpAttempts = 0;
      await existingUser.save();

      await this.mailservice.sendOtpEmail(normalizedEmail, otp);
      return { message: 'open your email to check for the verification email' };
    }

    const salt = await bcrypt.genSalt(10);
    if (!signupdto.password) {
      throw new BadRequestException('Password is required');
    }
    const hashedPassword = await bcrypt.hash(signupdto.password, salt);

    const otp = randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);

    const role = mapFrontendRole(signupdto.role) as roles;
    if (role === roles.ADMIN) {
      throw new BadRequestException(
        'Admin role must be assigned by a system administrator',
      );
    }
    const autoVerify = role === roles.OWNER;

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
    return { message: 'open your email to check for the verification email' };
  }

  async verifyOtp(VerifyDto: emailverificationDto) {
    const user = await this.findUserByEmail(VerifyDto.email);

    if (!user) {
      throw new BadRequestException('user not found');
    }

    if (user.isVerified === true) {
      return { message: 'user already verified' };
    }

    if (
      !user.emailVerificationOtp ||
      !user.emailVerificationOtpExpires ||
      user.emailVerificationOtpExpires < new Date()
    ) {
      throw new BadRequestException('invalid or expired otp');
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
      throw new BadRequestException('invalid or expired otp');
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
      throw new UnauthorizedException('invalid email or password');
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException('Account is blocked');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google or Apple.',
      );
    }

    const isMatch = await bcrypt.compare(signinDto.password, user.password);

    if (!isMatch) {
      // Same message for missing user and wrong password — no enumeration
      throw new UnauthorizedException('invalid email or password');
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
      throw new BadRequestException('No account found with this email');
    }

    if (user.isVerified) {
      return { message: 'Email is already verified. You can log in.' };
    }

    const otp = randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);

    user.emailVerificationOtp = hashToken(otp);
    user.emailVerificationOtpExpires = expires;
    user.emailVerificationOtpAttempts = 0;
    await user.save();

    await this.mailservice.sendOtpEmail(normalized, otp);
    return { message: 'A new verification code has been sent. Check your email.' };
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
      if (!user.oauthProvider) {
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
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
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
    // Keep the current token as the grace-period fallback before overwriting
    if (user.refreshToken) {
      user.previousRefreshToken = user.refreshToken;
      user.previousRefreshTokenExpiresAt = new Date(Date.now() + REFRESH_GRACE_MS);
    }
    user.refreshToken = hashedrefreshtoken;
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

    user.password = await bcrypt.hash(resetDto.newPassword, 12);
    user.resetToken = undefined;
    user.resetTokenExpiration = undefined;
    // A reset link is proof the old credentials are compromised — kill all sessions
    user.refreshToken = undefined;
    user.previousRefreshToken = undefined;
    user.previousRefreshTokenExpiresAt = undefined;

    await user.save();

    return { message: 'password reset successfully' };
  }

  async Logout(
    logoutDto: LogoutAuthDto,
    caller?: { id: string; email: string; role: string },
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
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException('Account is blocked');
    }

    // Constant-time comparison of SHA-256 hashes
    const providedHash = hashToken(refreshToken);
    if (!safeEqualHex(providedHash, user.refreshToken)) {
      // Grace window: an in-flight rotation from another tab may still be
      // re-using the just-replaced token. Accept it once and return the
      // current tokens instead of revoking the session.
      if (
        user.previousRefreshToken &&
        user.previousRefreshTokenExpiresAt &&
        user.previousRefreshTokenExpiresAt.getTime() > Date.now() &&
        safeEqualHex(providedHash, user.previousRefreshToken)
      ) {
        this.logger.debug(
          `Refresh grace period used for user ${user._id} — concurrent refresh absorbed`,
       );
        const accessTtl: any = process.env.JWT_ACCESS_TTL || '15m';
        return {
          accessToken: this.jwtservice.sign(payload as any, {
            expiresIn: accessTtl,
          }),
          refreshToken, // echo the still-graceful token back
          user: sanitizeUser(user),
        };
      }

      user.refreshToken = undefined;
      user.previousRefreshToken = undefined;
      user.previousRefreshTokenExpiresAt = undefined;
      await user.save().catch(() => undefined);
      throw new UnauthorizedException(
        'Reuse detected — please re-login with your credentials',
      );
    }

    // Successful rotation: clear the stale grace token
    user.previousRefreshToken = undefined;
    user.previousRefreshTokenExpiresAt = undefined;
    await user.save();

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: sanitizeUser(user),
    };
  }
}
