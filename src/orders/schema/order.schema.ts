import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export enum OrderStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  PREPARING = 'preparing',
  READY = 'ready',
  ON_WAY = 'on-way',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  menuItemId!: Types.ObjectId;
  @Prop({ required: true })
  name!: string;
  @Prop({ required: true })
  qty!: number;
  @Prop({ required: true })
  price!: number;
}

@Schema({ _id: false })
export class OrderDeliveryAddress {
  @Prop()
  street?: string;
  @Prop()
  apartment?: string;
  @Prop()
  city?: string;
  @Prop()
  postalCode?: string;
  @Prop()
  phone?: string;
  @Prop()
  instructions?: string;
}

@Schema({ _id: false })
export class OrderTimelineStep {
  @Prop({ required: true })
  key!: string;
  @Prop({ required: true })
  label!: string;
  @Prop()
  time?: string;
  @Prop({ default: false })
  done!: boolean;
}

export type orderDocument = order & Document;

@Schema({ timestamps: true })
export class order {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  customerId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'restaurant', required: true, index: true })
  restaurantId!: Types.ObjectId;
  @Prop({ type: [OrderItem], required: true })
  items!: OrderItem[];
  @Prop({ type: OrderDeliveryAddress })
  deliveryAddress?: OrderDeliveryAddress;
  @Prop()
  timeSlot?: string;
  @Prop()
  promoCode?: string;
  @Prop({ required: true })
  subtotal!: number;
  @Prop({ default: 3.99 })
  deliveryFee!: number;
  @Prop({ default: 0 })
  discount!: number;
  @Prop({ required: true })
  total!: number;
  @Prop({ type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING, index: true })
  status!: OrderStatus;
  @Prop({ default: '25-35 min' })
  eta!: string;
  @Prop()
  rider?: string;
  @Prop({ type: [OrderTimelineStep], default: [] })
  timeline!: OrderTimelineStep[];
  // Customer history removal is a per-customer hide; keep the order and its
  // payment record available for restaurant operations and accounting.
  @Prop({ default: false, index: true })
  hiddenForCustomer!: boolean;
}

export const orderSchema = SchemaFactory.createForClass(order);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
