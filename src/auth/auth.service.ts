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
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly jwtservice: JwtService,
  ) {}

  async createUser(signupdto: CreateAuthDto) {
    const existingUser = await this.userModel.findOne({
      email: signupdto.email,
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }


    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(signupdto.password,salt)
 
        const newUser = await this.userModel.create({
      name: signupdto.name,
      email: signupdto.email,
      password: hashedPassword,
      phone: signupdto.phone,
      role: signupdto.role as roles,
      profile: signupdto.profile,
    });

    const payload = {sub:newUser._id.toString(),email:newUser.email}

    const accesstoken = await this.jwtservice.sign(payload);

    return {accesstoken};
  }

  findAll() {
    return `This action returns all auth`;
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
