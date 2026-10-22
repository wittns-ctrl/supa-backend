import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Review edits can only change the review's own content — rating and comment.
 * Inheriting restaurantId/customerId from CreateReviewDto would let a caller
 * move a review to a different restaurant, leaving the old restaurant's
 * cached rating stale.
 */
export class UpdateReviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
