import { IsJWT, IsNotEmpty } from 'class-validator';

export class RefreshAuthDto {
  @IsNotEmpty()
  @IsJWT()
  refreshToken!: string;
}
