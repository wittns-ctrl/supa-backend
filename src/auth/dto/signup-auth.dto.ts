import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, MinLength, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

class ProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageurl?: string;
}

export class CreateAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter and one digit',
  })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Phone must be a valid phone number (7-20 digits, may start with +)',
  })
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['customer', 'owner', 'restaurant_owner'], {
    message: 'role must be one of: customer, owner, restaurant_owner',
  })
  role!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDto)
  profile?: ProfileDto;
}
