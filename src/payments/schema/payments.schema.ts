import { SchemaFactory, Prop, Schema } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

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
}

export type paymentDocument = payment & Document;

@Schema({ timestamps: true })
export class payment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'bookings' })
  bookingId!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'order', index: true })
  orderId?: Types.ObjectId;
  @Prop({ required: true })
  amount!: Number;
  @Prop({ type: String, enum: Object.values(Payments), required: true })
  status!: Payments;
  @Prop({ type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.PAYPAL })
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

paymentschema.index({ status: 1, updatedAt: -1, orderId: 1 });
