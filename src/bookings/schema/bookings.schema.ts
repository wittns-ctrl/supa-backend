import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export enum reviewsEnums {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

export type bookingsDocument = bookings & Document;

@Schema({ timestamps: true })
export class bookings {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  customerId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'restaurant', required: true, index: true })
  restaurantId!: Types.ObjectId;
  @Prop({ required: true, index: true })
  bookingDate!: Date;
  @Prop({ required: true })
  bookingTime!: string;
  @Prop({ required: true, min: 1 })
  guests!: Number;
  @Prop({ type: String, enum: Object.values(reviewsEnums), required: true, index: true })
  status!: reviewsEnums;
  @Prop({ required: true })
  specialRequest!: string;
  @Prop()
  ownerNote?: string;
  @Prop()
  rejectionReason?: string;
}

export const bookingschema = SchemaFactory.createForClass(bookings);

bookingschema.index({ restaurantId: 1, bookingDate: 1, status: 1 });
