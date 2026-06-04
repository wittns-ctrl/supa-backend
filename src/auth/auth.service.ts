import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateAuthDto } from './dto/signup-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { loginAuthDto } from './dto/login-auth.dto';
import { resetAuthDto } from './dto/reset-auth.dto';
import { ForgotAuthDto } from './dto/Forgot.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { roles, User, UserDocument } from '../users/schema/user.schema';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { emailverificationDto } from './dto/emailVerification.dto';

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

    const newUser = await this.userModel.create({
      name: signupdto.name,
      email: signupdto.email,
      password: hashedPassword,
      phone: signupdto.phone,
      role: signupdto.role as roles,
      isVerified: false,
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: expires,
      profile: signupdto.profile,
    });

    await this.mailservice.sendOtpEmail(signupdto.email, otp);

    return 'open your email to check for the verification email';
  }

  async verifyOtp(VerifyDto: emailverificationDto) {
    const user = await this.userModel.findOne({ email: VerifyDto.email });

    if (!user) {
      throw new BadRequestException('user not found');
    }

    if (user.isVerified == true) {
      return 'user already exists';
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

    return 'email verified successfully';
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
