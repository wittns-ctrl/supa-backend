import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppleAuthService } from './apple-auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, Userschema } from 'src/users/schema/user.schema';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from 'src/mail/mail.module';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { OAuthStateService } from './oauth-state.service';
import { OAuthCodeRecord, OAuthCodeRecordSchema, OAuthStateRecord, OAuthStateRecordSchema } from './schema/oauth-record.schema';

@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: Userschema },
      { name: OAuthStateRecord.name, schema: OAuthStateRecordSchema },
      { name: OAuthCodeRecord.name, schema: OAuthCodeRecordSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configservice: ConfigService) => {
        return {
          secret: configservice.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: '15m',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AppleAuthService, JwtStrategy, GoogleStrategy, OAuthStateService],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
