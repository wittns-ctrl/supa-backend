import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(roles.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('analytics/overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('analytics/revenue')
  getRevenue(@Query('period') period?: string) {
    return this.adminService.getRevenueChart(period);
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.adminService.updateSettings(body);
  }

  @Post('maintenance/:action')
  maintenance(@Param('action') action: string) {
    return this.adminService.maintenanceAction(action);
  }
}
