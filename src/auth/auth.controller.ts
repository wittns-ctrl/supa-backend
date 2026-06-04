import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/signup-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { emailverificationDto } from './dto/emailVerification.dto';
import { loginAuthDto } from './dto/login-auth.dto';
import { ForgotAuthDto } from './dto/Forgot.dto';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() signupdto: CreateAuthDto) {
    return this.authService.createUser(signupdto);
  }

  @Post('verifyOtp')
  verifyOtp(@Body() verifydto:emailverificationDto) {
    return this.authService.verifyOtp(verifydto);
  }

  @Post('Login')
  Login(@Body() Logindto:loginAuthDto) {
    return this.authService.signin(Logindto);
  }

  @Post('forgot')
  forgotPassword(@Body() forgetDto:ForgotAuthDto) {
    return this.authService.ForgotPassword(forgetDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authService.remove(+id);
  }
}
