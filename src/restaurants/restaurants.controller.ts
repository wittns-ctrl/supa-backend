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
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { RestaurantStatus } from './schema/restaurant.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  create(@Body() createRestaurantDto: CreateRestaurantDto) {
    return this.restaurantsService.createRestaurant(createRestaurantDto);
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
  findByOwner(@Param('ownerId') ownerId: string) {
    return this.restaurantsService.findByOwner(ownerId);
  }

  @Get(':id/analytics/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  analyticsOverview(@Param('id') id: string) {
    return this.restaurantsService.getAnalyticsOverview(id);
  }

  @Get(':id/analytics/revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  analyticsRevenue(
    @Param('id') id: string,
    @Query('period') period?: string,
  ) {
    return this.restaurantsService.getRevenueChart(id, period);
  }

  @Get(':id/analytics/peak-hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  analyticsPeakHours(@Param('id') id: string) {
    return this.restaurantsService.getPeakHours(id);
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
    @Body() body: { approved: boolean; rejectionReason?: string },
  ) {
    return this.restaurantsService.approve(id, body.approved, body.rejectionReason);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  setStatus(@Param('id') id: string, @Body() body: { status: RestaurantStatus }) {
    return this.restaurantsService.setStatus(id, body.status);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  addImages(@Param('id') id: string, @Body() body: { images: string[] }) {
    return this.restaurantsService.addImages(id, body.images);
  }

  @Delete(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  removeImage(@Param('id') id: string, @Body() body: { imageUrl: string }) {
    return this.restaurantsService.removeImage(id, body.imageUrl);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.OWNER, roles.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateRestaurantDto: UpdateRestaurantDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.restaurantsService.update(id, updateRestaurantDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.restaurantsService.remove(id);
  }
}
