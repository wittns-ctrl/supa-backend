import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customerId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'restaurant', required: true })
  restaurantId!: Types.ObjectId;
  @Prop({ required: true })
  bookingDate!: Date;
  @Prop({ required: true })
  bookingTime!: string;
  @Prop({ required: true })
  guests!: Number;
  @Prop({ type: String, enum: Object.values(reviewsEnums), required: true })
  status!: reviewsEnums;
  @Prop({ required: true })
  specialRequest!: string;
  @Prop()
  ownerNote?: string;
  @Prop()
  rejectionReason?: string;
}

export const bookingschema = SchemaFactory.createForClass(bookings);
