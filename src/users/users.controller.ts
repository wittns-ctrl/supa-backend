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
import { UpdateUserDto, SetUserRoleDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from './schema/user.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { SetUserStatusDto } from './dto/set-status.dto';
import { CreateAuthDto } from 'src/auth/dto/signup-auth.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  findAll(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll(role, status, page, limit);
  }

  @Get(':id/favorites')
  @UseGuards(JwtAuthGuard)
  getFavorites(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.getFavorites(id, user.id, user.role);
  }

  @Post(':id/favorites/:restaurantId')
  @UseGuards(JwtAuthGuard)
  addFavorite(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.addFavorite(id, restaurantId, user.id, user.role);
  }

  @Delete(':id/favorites/:restaurantId')
  @UseGuards(JwtAuthGuard)
  removeFavorite(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.removeFavorite(
      id,
      restaurantId,
      user.id,
      user.role,
    );
  }

  @Get(':id/dashboard-stats')
  @UseGuards(JwtAuthGuard)
  getDashboardStats(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.getDashboardStats(id, user.id, user.role);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.findOne(id, user.id, user.role);
  }

  @Patch(':id/password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.changePassword(id, dto, user.id, user.role);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  setStatus(@Param('id') id: string, @Body() body: SetUserStatusDto) {
    return this.usersService.setStatus(id, body.status);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  setRole(@Param('id') id: string, @Body() body: SetUserRoleDto) {
    return this.usersService.setRole(id, body.role);
  }

  @Post('admin-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  createAdminAccount(@Body() dto: CreateAuthDto) {
    return this.usersService.createAdminAccount(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.usersService.update(id, updateUserDto, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
