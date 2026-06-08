import { SchemaFactory, Schema, Prop } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type reviewDocument = review & Document;

@Schema({ timestamps: true })
export class review {
  @Prop({ type: Types.ObjectId, ref: 'restaurant', required: true })
  restaurantId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customerId!: Types.ObjectId;
  @Prop({ required: true })
  rating!: Number;
  @Prop({ required: true })
  comment!: string;
}

export const reviewschema = SchemaFactory.createForClass(review);
