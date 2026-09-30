import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class AddImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  // Accept local upload paths (/uploads/<uuid>.<ext>) or https URLs only
  @Matches(/^(\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)|https:\/\/.+)$/, {
    each: true,
    message:
      'each image must be an uploaded path (/uploads/…) or an https URL',
  })
  images!: string[];
}
