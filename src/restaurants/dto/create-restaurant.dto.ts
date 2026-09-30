import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LocationDto {
  @IsString()
  @MinLength(3)
  address!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class CreateRestaurantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  // Set server-side from the JWT caller; clients never choose the owner
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message:
      'Phone must be a valid phone number (7-20 chars, may start with +)',
  })
  phone!: string;

  @IsString()
  @MinLength(3)
  opening!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  capacity!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  cuisine?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  verificationDocs?: string[];

  @IsOptional()
  @IsEnum(['pending', 'active', 'suspended', 'rejected'])
  status?: string;
}
