import { IsNotEmpty, IsString } from 'class-validator';

export class resetAuthDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}
