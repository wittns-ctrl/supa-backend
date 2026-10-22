import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateMenuDto {
  @IsMongoId({ message: 'restaurant must be a valid id' })
  restaurant!: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsNumber({}, { message: 'price must be a number' })
  @Min(0)
  price!: number;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  spicy?: boolean;

  @IsOptional()
  @IsBoolean()
  veg?: boolean;
}
