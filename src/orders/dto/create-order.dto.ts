import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
  Matches,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsNotEmpty()
  @IsMongoId()
  menuItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;
}

export class DeliveryAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}\s,.'#+\/-]{1,199}$/u)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  apartment?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}\s.'-]{1,99}$/u)
  city?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 -]{1,19}$/)
  postalCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  @Matches(/^\+?[0-9][0-9\s().-]{6,18}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsNotEmpty()
  @IsMongoId()
  restaurantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ASAP (25-35 min)', '12:00 PM', '12:30 PM', '1:00 PM', '7:00 PM', '7:30 PM', '8:00 PM'])
  @MaxLength(50)
  timeSlot?: string;

}
