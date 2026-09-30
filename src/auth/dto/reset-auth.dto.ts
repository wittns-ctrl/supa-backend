import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class resetAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(200)
  newPassword!: string;
}
