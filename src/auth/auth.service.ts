import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
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
import { randomInt, randomUUID } from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { emailverificationDto } from './dto/emailVerification.dto';
import { LogoutAuthDto } from './dto/Logout.dto';
import { mapFrontendRole, sanitizeUser } from 'src/common/utils/user-response.util';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly jwtservice: JwtService,
    private readonly mailservice: MailService,
  ) {}

  async createUser(signupdto: CreateAuthDto) {
    const existingUser = await this.userModel.findOne({
      email: signupdto.email,
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(signupdto.password, salt);

    const otp = randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);

    const role = mapFrontendRole(signupdto.role) as roles;
    const autoVerify = role === roles.OWNER;

    await this.userModel.create({
      name: signupdto.name,
      email: signupdto.email,
      password: hashedPassword,
      phone: signupdto.phone,
      role,
      isVerified: autoVerify,
      emailVerificationOtp: autoVerify ? undefined : otp,
      emailVerificationOtpExpires: autoVerify ? undefined : expires,
      profile: signupdto.profile,
    });

    if (!autoVerify) {
      await this.mailservice.sendOtpEmail(signupdto.email, otp);
    }

    return { message: 'open your email to check for the verification email' };
  }

  async verifyOtp(VerifyDto: emailverificationDto) {
    const user = await this.userModel.findOne({ email: VerifyDto.email });

    if (!user) {
      throw new BadRequestException('user not found');
    }

    if (user.isVerified === true) {
      return { message: 'user already verified' };
    }

    if (
      !user.emailVerificationOtp ||
      !user.emailVerificationOtpExpires ||
      user.emailVerificationOtp !== VerifyDto.otp ||
      user.emailVerificationOtpExpires < new Date()
    ) {
      throw new BadRequestException('otp expired');
    }

    user.emailVerificationOtp = undefined;
    user.emailVerificationOtpExpires = undefined;
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
    const user = await this.userModel.findOne({ email: signinDto.email });

    if (!user) {
      throw new UnauthorizedException('user not exits');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    const isMatch = await bcrypt.compare(signinDto.password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('invalid password');
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
    const refreshtoken = this.jwtservice.sign(payload, {
      secret: process.env.JWT_REFRESH,
      expiresIn: '7d',
    });

    const hashedrefreshtoken = await bcrypt.hash(refreshtoken, 10);
    user.refreshToken = hashedrefreshtoken;
    await user.save();

    const accessToken = this.jwtservice.sign(payload);
    return { accessToken, refreshToken: refreshtoken };
  }

  async ForgotPassword(forgotDto: ForgotAuthDto) {
    const user = await this.userModel.findOne({ email: forgotDto.email });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    const resettoken = randomUUID();
    const resettokenExpires = new Date();
    resettokenExpires.setMinutes(resettokenExpires.getMinutes() + 15);

    user.resetToken = resettoken;
    user.resetTokenExpiration = resettokenExpires;

    await user.save();

    const link = `http://localhost:5173/reset-password?token=${resettoken}`;
    await this.mailservice.sendOtpEmail(forgotDto.email, link);

    return { message: 'Reset link sent to the email' };
  }

  async ressetpassword(resetDto: resetAuthDto) {
    const user = await this.userModel.findOne({
      resetToken: resetDto.token,
    });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (!user.resetToken || user.resetTokenExpiration! < new Date()) {
      throw new UnauthorizedException('token expired');
    }

    const hash = await bcrypt.hash(resetDto.newPassword, 12);

    user.password = hash;
    user.resetToken = undefined;
    user.resetTokenExpiration = undefined;

    await user.save();

    return { message: 'password reset successfully' };
  }

  async Logout(logoutDto: LogoutAuthDto) {
    const user = await this.userModel.findOne({ email: logoutDto.email });

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    if (!user.refreshToken) {
      throw new UnauthorizedException('user already logged out');
    }

    user.refreshToken = undefined;
    await user.save();

    return { message: 'user logged out successfully' };
  }
}
