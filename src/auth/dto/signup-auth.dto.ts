import { IsString, IsNotEmpty, IsOptional, IsNumberString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

class ProfileDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  imageurl?: string;
}

export class CreateAuthDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;           // 👈 this will now throw 400 if missing/undefined

  @IsOptional()
  phone?: number;             // 👈 lowercase number (primitive)

  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDto)
  profile?: ProfileDto;
}