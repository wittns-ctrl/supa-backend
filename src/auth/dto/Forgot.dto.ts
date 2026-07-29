import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
