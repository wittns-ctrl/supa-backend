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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
    return this.authService.update(+id, updateAuthDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authService.remove(+id);
  }
}
