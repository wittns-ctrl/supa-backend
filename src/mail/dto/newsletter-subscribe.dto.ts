import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class NewsletterSubscribeDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string;
}
