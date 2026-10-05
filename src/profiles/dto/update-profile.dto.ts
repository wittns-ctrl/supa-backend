import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateProfileDto } from './create-profile.dto';

export class UpdateProfileDto extends PartialType(CreateProfileDto) {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  // Stored as string in the schema — numbers would drop leading zeros and "+" codes
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
