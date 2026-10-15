import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class resetAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(200)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter and one digit',
  })
  newPassword!: string;
}
