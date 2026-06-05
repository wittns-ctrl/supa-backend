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
import { resetAuthDto } from './dto/reset-auth.dto';
import { LogoutAuthDto } from './dto/Logout.dto';


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

  @Post('reset')
  resetpassword(@Body() resetdto:resetAuthDto) {
  return this.authService.ressetpassword(resetdto)
  }

  @Post('logout')
  logout(@Body() logoutdto:LogoutAuthDto){
    return this.authService.Logout(logoutdto)
  }

}
