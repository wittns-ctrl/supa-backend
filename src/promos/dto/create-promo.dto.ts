import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  Min,
  IsUppercase,
} from 'class-validator';
import { PromoDiscountType } from '../schema/promo.schema';

export class CreatePromoDto {
  @IsString()
  @IsUppercase()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PromoDiscountType)
  discountType!: PromoDiscountType;

  @IsNumber()
  @Min(0)
  discountValue!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountValue?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  usageLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
