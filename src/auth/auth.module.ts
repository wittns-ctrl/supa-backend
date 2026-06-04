import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User,Userschema } from 'src/users/schema/user.schema';
import { JwtModule,JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports:[MongooseModule.forFeature([{name:User.name,schema:Userschema}]),
  JwtModule.registerAsync({
    imports:[ConfigModule],
    inject:[ConfigService],
    useFactory : (configservice:ConfigService) => {
      return {
        secret : process.env.JWT_SECRET,
        signOptions : {
          expiresIn : '15m'
        }
      }
    }
  })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
