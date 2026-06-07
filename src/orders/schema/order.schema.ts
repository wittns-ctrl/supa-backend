import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/users/schema/user.schema';
import { restaurant } from 'src/restaurants/schema/restaurant.schema';

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
  @Prop({ type: Types.ObjectId, required: true })
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
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  customerId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: restaurant.name, required: true })
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
  @Prop({ type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING })
  status!: OrderStatus;
  @Prop({ default: '25-35 min' })
  eta!: string;
  @Prop()
  rider?: string;
  @Prop({ type: [OrderTimelineStep], default: [] })
  timeline!: OrderTimelineStep[];
}

export const orderSchema = SchemaFactory.createForClass(order);
