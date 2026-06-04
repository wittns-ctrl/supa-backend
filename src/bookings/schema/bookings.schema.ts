import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/users/schema/user.schema';
import { restaurant } from 'src/restaurants/schema/restaurant.schema';

export enum reviewsEnums {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export type bookingsDocument = bookings & Document;

@Schema({ timestamps: true })
export class bookings {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  customerId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: restaurant.name, required: true })
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
}

export const bookingschema = SchemaFactory.createForClass(bookings);
