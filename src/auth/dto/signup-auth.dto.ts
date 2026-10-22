import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsIn,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
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
  @MinLength(15, { message: 'Password must be at least 15 characters long' })
  @MaxLength(72, { message: 'Password cannot exceed 72 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message:
      'Phone must be a valid phone number (7-20 digits, may start with +)',
  })
  phone?: string;

  // Customer signup cannot request elevated access. Owner registration uses
  // its own endpoint and remains pending until administrator approval.
  @IsOptional()
  @IsString()
  @IsIn(['customer'], {
    message: 'Public signup only supports customer accounts',
  })
  role?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDto)
  profile?: ProfileDto;
}
