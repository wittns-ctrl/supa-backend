import { IsEmail, IsOptional } from 'class-validator';

export class LogoutAuthDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}