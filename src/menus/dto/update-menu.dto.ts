import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateMenuDto } from './create-menu.dto';

/**
 * `restaurant` is intentionally not editable: ownership is checked against the
 * item's CURRENT restaurant, so accepting a new one would let an owner move an
 * item into (or inject it onto) any other restaurant's menu.
 */
export class UpdateMenuDto extends PartialType(
  OmitType(CreateMenuDto, ['restaurant'] as const),
) {}
