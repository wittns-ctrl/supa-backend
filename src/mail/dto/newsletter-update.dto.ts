import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class NewsletterUpdateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
