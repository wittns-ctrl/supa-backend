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
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { roles } from 'src/users/schema/user.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PromosService } from './promos.service';
import { CreatePromoDto } from './dto/create-promo.dto';
import { UpdatePromoDto } from './dto/update-promo.dto';
import { ValidatePromoDto } from './dto/validate-promo.dto';

@Controller('promos')
export class PromosController {
  constructor(private readonly promosService: PromosService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  create(@Body() dto: CreatePromoDto) {
    return this.promosService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  findAll(@Query('activeOnly') activeOnly?: boolean, @Query('code') code?: string) {
    return this.promosService.findAll({ activeOnly, code });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  findOne(@Param('id') id: string) {
    return this.promosService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePromoDto) {
    return this.promosService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.promosService.remove(id);
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  validate(
    @Body() dto: ValidatePromoDto,
    @CurrentUser() _user: { id: string; role: string },
  ) {
    return this.promosService.validateCode(dto.code, dto.subtotal);
  }
}
