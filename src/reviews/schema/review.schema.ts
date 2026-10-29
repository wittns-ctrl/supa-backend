import { SchemaFactory, Schema, Prop } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type reviewDocument = review & Document;

@Schema({ timestamps: true })
export class review {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'restaurant',
    required: true,
    index: true,
  })
  restaurantId!: Types.ObjectId;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  customerId!: Types.ObjectId;
  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;
  @Prop({ required: true, maxlength: 2000 })
  comment!: string;
}

export const reviewschema = SchemaFactory.createForClass(review);

reviewschema.index({ restaurantId: 1, createdAt: -1 });
// Backs the "already reviewed this restaurant?" check on every new review
reviewschema.index({ customerId: 1, restaurantId: 1 });
