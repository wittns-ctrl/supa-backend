import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

export class ProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  // Data URLs are allowed (profile picture preview) — bound the size
  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  imageurl?: string;
}

/**
 * Self-service profile update. Deliberately does NOT extend CreateUserDto:
 * role / status / password must never be patchable through this endpoint.
 * Password changes go through PATCH /users/:id/password (verified),
 * role changes through PATCH /users/:id/role (admin only).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  // Empty string allowed (user clearing the field); otherwise a valid phone
  @IsOptional()
  @Matches(/^(\+?[0-9\s\-()]{7,20})?$/, {
    message: 'Phone must be a valid phone number',
  })
  phone?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProfileDto)
  profile?: ProfileDto;
}

/** Admin-only role assignment (promote/demote accounts). */
export class SetUserRoleDto {
  @IsIn(['customer', 'admin'])
  role!: 'customer' | 'admin';
}
