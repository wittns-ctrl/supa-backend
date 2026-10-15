import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class resetAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(15, { message: 'Password must be at least 15 characters long' })
  @MaxLength(72, { message: 'Password cannot exceed 72 characters' })
  newPassword!: string;
}
