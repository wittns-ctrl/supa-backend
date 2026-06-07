import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class DeliveryAddressDto {
  street?: string;
  apartment?: string;
  city?: string;
  postalCode?: string;
  instructions?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  deliveryAddress?: DeliveryAddressDto;
  profile?: { bio?: string; imageurl?: string };
}
