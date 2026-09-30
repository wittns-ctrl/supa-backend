import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';
import { reviewsEnums } from '../schema/bookings.schema';

export class UpdateBookingDto extends PartialType(CreateBookingDto) {
  // Whitelisted — a raw status string would hit the mongoose enum and 500
  @IsOptional()
  @IsIn(Object.values(reviewsEnums), {
    message: `status must be one of: ${Object.values(reviewsEnums).join(', ')}`,
  })
  status?: reviewsEnums;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ownerNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
