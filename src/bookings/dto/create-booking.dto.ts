import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsNotEmpty()
  @IsMongoId()
  restaurantId!: string;

  @IsNotEmpty()
  @IsDateString({}, { message: 'bookingDate must be a valid ISO date' })
  bookingDate!: string;

  @IsNotEmpty()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'bookingTime must be in HH:MM format' })
  bookingTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  specialRequest?: string;
}
