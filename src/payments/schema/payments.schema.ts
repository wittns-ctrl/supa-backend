import { SchemaFactory, Prop, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { bookings } from 'src/bookings/schema/bookings.schema';

export enum Payments {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export type paymentDocument = payment & Document;

@Schema({ timestamps: true })
export class payment {
  @Prop({ type: Types.ObjectId, ref: bookings.name })
  bookingId!: string;
  @Prop({ required: true })
  amount!: Number;
  @Prop({ type: String, enum: Object.values(Payments), required: true })
  status!: Payments;
  @Prop({ required: true })
  transactionId!: string;
}

export const paymentschema = SchemaFactory.createForClass(payment);
