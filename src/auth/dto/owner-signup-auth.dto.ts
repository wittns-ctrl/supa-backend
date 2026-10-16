import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { CreateAuthDto } from './signup-auth.dto';
import { CreateRestaurantDto } from 'src/restaurants/dto/create-restaurant.dto';

export class CreateOwnerAuthDto extends CreateAuthDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateRestaurantDto)
  restaurant!: CreateRestaurantDto;
}
