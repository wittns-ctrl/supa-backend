import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class emailverificationDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;   

  @IsString()
  @IsNotEmpty()
  otp!: string;     
}
