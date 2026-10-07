import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PromoDiscountType {
  FLAT = 'flat',
  PERCENT = 'percent',
}

export type PromoDocument = Promo & Document;

@Schema({ timestamps: true })
export class Promo {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code!: string;

  @Prop()
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(PromoDiscountType),
    required: true,
  })
  discountType!: PromoDiscountType;

  @Prop({ required: true, min: 0 })
  discountValue!: number;

  @Prop({ min: 0 })
  minOrderValue?: number;

  @Prop({ min: 0 })
  maxDiscountValue?: number;

  @Prop()
  startsAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ min: 0 })
  usageLimit?: number;

  @Prop({ default: 0, min: 0 })
  timesUsed!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export const PromoSchema = SchemaFactory.createForClass(Promo);
