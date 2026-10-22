import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { effectiveRestaurantRole } from 'src/common/utils/auth-access.util';

@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  create(
    @Body() createMenuDto: CreateMenuDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.menusService.create(
      createMenuDto,
      user.id,
      effectiveRestaurantRole(user),
    );
  }

  @Get()
  findAll(
    @Query('restaurantId') restaurantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.menusService.findAll(restaurantId, page, limit);
  }

  @Get('owner/:restaurantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  findAllForOwner(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: { id: string; role: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.menusService.findAllForOwner(
      restaurantId,
      user.id,
      effectiveRestaurantRole(user),
      page,
      limit,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menusService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateMenuDto: UpdateMenuDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.menusService.update(
      id,
      updateMenuDto,
      user.id,
      effectiveRestaurantRole(user),
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.menusService.remove(id, user.id, effectiveRestaurantRole(user));
  }
}
