import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles, UserStatus } from './schema/user.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  findAll(@Query('role') role?: string, @Query('status') status?: string) {
    return this.usersService.findAll(role, status);
  }

  @Get(':id/favorites')
  @UseGuards(JwtAuthGuard)
  getFavorites(@Param('id') id: string) {
    return this.usersService.getFavorites(id);
  }

  @Post(':id/favorites/:restaurantId')
  @UseGuards(JwtAuthGuard)
  addFavorite(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.usersService.addFavorite(id, restaurantId);
  }

  @Delete(':id/favorites/:restaurantId')
  @UseGuards(JwtAuthGuard)
  removeFavorite(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.usersService.removeFavorite(id, restaurantId);
  }

  @Get(':id/dashboard-stats')
  @UseGuards(JwtAuthGuard)
  getDashboardStats(@Param('id') id: string) {
    return this.usersService.getDashboardStats(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  setStatus(@Param('id') id: string, @Body() body: { status: UserStatus }) {
    return this.usersService.setStatus(id, body.status);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
