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
  UnauthorizedException,
} from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { RestaurantStatus } from './schema/restaurant.schema';
import { SetRestaurantStatusDto, ApproveRestaurantDto } from './dto/set-status.dto';
import { AddImagesDto } from './dto/add-images.dto';
import { effectiveRestaurantRole, userHasRole } from 'src/common/utils/auth-access.util';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createRestaurantDto: CreateRestaurantDto,
    @CurrentUser() user: { id: string; role: string; accountType?: string },
  ) {
    if (user.accountType === 'owner' && userHasRole(user, roles.OWNER)) {
      return this.restaurantsService.createRestaurantForAccount(
        createRestaurantDto,
        user.id,
      );
    }
    if (user.accountType === 'admin' && user.role === roles.ADMIN) {
      return this.restaurantsService.createRestaurant(createRestaurantDto);
    }
    throw new UnauthorizedException(
      'Use the restaurant owner application to create a separate owner account',
    );
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('cuisine') cuisine?: string,
    @Query('location') location?: string,
    @Query('rating') rating?: string,
    @Query('approvedOnly') approvedOnly?: string,
  ) {
    return this.restaurantsService.findAll({
      search,
      cuisine,
      location,
      rating,
      approvedOnly,
    });
  }

  @Get('owner/:ownerId')
  @UseGuards(JwtAuthGuard)
  findByOwner(@Param('ownerId') ownerId: string, @CurrentUser() user: { id: string; role: string }) {
    if (user.role !== 'admin' && user.id !== ownerId) {
      throw new UnauthorizedException('You are not authorized to view these restaurants');
    }
    return this.restaurantsService.findByOwner(ownerId);
  }

  @Get(':id/analytics/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  analyticsOverview(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.restaurantsService.getAnalyticsOverview(id, user.id, effectiveRestaurantRole(user));
  }

  @Get(':id/analytics/revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  analyticsRevenue(
    @Param('id') id: string,
    @Query('period') period?: string,
    @CurrentUser() user?: { id: string; role: string },
  ) {
    return this.restaurantsService.getRevenueChart(id, period, user?.id, effectiveRestaurantRole(user));
  }

  @Get(':id/analytics/peak-hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  analyticsPeakHours(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.restaurantsService.getPeakHours(id, user.id, effectiveRestaurantRole(user));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restaurantsService.findOne(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  approve(
    @Param('id') id: string,
    @Body() body: ApproveRestaurantDto,
  ) {
    return this.restaurantsService.approve(id, body.approved, body.rejectionReason);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  setStatus(@Param('id') id: string, @Body() body: SetRestaurantStatusDto) {
    return this.restaurantsService.setStatus(id, body.status);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  addImages(
    @Param('id') id: string,
    @Body() body: AddImagesDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.restaurantsService.addImages(id, body.images, user.id, effectiveRestaurantRole(user));
  }

  @Delete(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  removeImage(
    @Param('id') id: string,
    @Body() body: { imageUrl: string },
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.restaurantsService.removeImage(id, body.imageUrl, user.id, effectiveRestaurantRole(user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateRestaurantDto: UpdateRestaurantDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.restaurantsService.update(id, updateRestaurantDto, user.id, effectiveRestaurantRole(user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.restaurantsService.remove(id);
  }
}
