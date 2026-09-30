import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
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
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  apartment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timeSlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  promoCode?: string;
}
