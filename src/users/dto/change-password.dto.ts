import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(15, { message: 'Password must be at least 15 characters long' })
  @MaxLength(72, { message: 'Password cannot exceed 72 characters' })
  newPassword!: string;
}
