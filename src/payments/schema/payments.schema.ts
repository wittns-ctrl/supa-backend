import { SchemaFactory, Prop, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum Payments {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CARD = 'card',
  PAYPAL = 'paypal',
  CASH = 'cash',
  STRIPE = 'stripe',
}

export type paymentDocument = payment & Document;

@Schema({ timestamps: true })
export class payment {
  @Prop({ type: Types.ObjectId, ref: 'bookings' })
  bookingId!: string;
  @Prop({ type: Types.ObjectId, ref: 'order', index: true })
  orderId?: Types.ObjectId;
  @Prop({ required: true })
  amount!: Number;
  @Prop({ type: String, enum: Object.values(Payments), required: true })
  status!: Payments;
  @Prop({ type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.STRIPE })
  method?: PaymentMethod;
  @Prop({ index: true })
  transactionId?: string;
  @Prop({ index: true, unique: true, sparse: true })
  paymentIntentId?: string;
  @Prop()
  currency?: string;
  @Prop({ type: Map, of: String, default: {} })
  metadata?: Record<string, string>;
}

export const paymentschema = SchemaFactory.createForClass(payment);

paymentschema.index({ paymentIntentId: 1 }, { unique: true, sparse: true });
