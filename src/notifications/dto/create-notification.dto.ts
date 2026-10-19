import { IsMongoId, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNotificationDto {
  @IsMongoId()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
