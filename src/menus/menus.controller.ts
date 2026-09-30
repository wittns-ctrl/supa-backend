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
    return this.menusService.create(createMenuDto, user.id, user.role);
  }

  @Get()
  findAll(@Query('restaurantId') restaurantId?: string) {
    return this.menusService.findAll(restaurantId);
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
    return this.menusService.update(id, updateMenuDto, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.menusService.remove(id, user.id, user.role);
  }
}
