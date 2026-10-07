import { SchemaFactory, Schema, Prop } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type reviewDocument = review & Document;

@Schema({ timestamps: true })
export class review {
  @Prop({ type: Types.ObjectId, ref: 'restaurant', required: true, index: true })
  restaurantId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customerId!: Types.ObjectId;
  @Prop({ required: true, min: 1, max: 5 })
  rating!: Number;
  @Prop({ required: true, maxlength: 2000 })
  comment!: string;
}

export const reviewschema = SchemaFactory.createForClass(review);

reviewschema.index({ restaurantId: 1, createdAt: -1 });
