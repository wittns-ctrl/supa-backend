import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RestaurantStatus } from '../schema/restaurant.schema';

export class SetRestaurantStatusDto {
  @IsIn(Object.values(RestaurantStatus), {
    message: `status must be one of: ${Object.values(RestaurantStatus).join(', ')}`,
  })
  status!: RestaurantStatus;
}

export class ApproveRestaurantDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
