import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUrl({}, { message: 'imageurl must be a valid URL' })
  imageurl?: string;
}
