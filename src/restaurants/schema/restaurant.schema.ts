import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';

export type restaurantDocument = restaurant & Document;

export enum RestaurantStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

@Schema({ _id: false })
export class Location {
  @Prop({ required: true })
  address!: string;
  @Prop({ required: true })
  city!: string;
  @Prop({ required: true })
  latitude!: number;
  @Prop({ required: true })
  longitude!: number;
}

@Schema({ timestamps: true })
export class restaurant {
  @Prop({ required: true })
  name!: string;
  @Prop({ required: true })
  description!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;
  @Prop({ type: Location, required: true })
  location!: Location;
  // Phone stored as string — Numbers drop leading zeros and "+" country codes
  @Prop({ required: true })
  phone!: string;
  @Prop({ required: true })
  opening!: string;
  @Prop({ required: true })
  capacity!: number;
  @Prop({ type: [String], default: [] })
  images!: string[];
  @Prop({ required: true, default: false })
  isApproved!: boolean;
  @Prop({ type: String, enum: Object.values(RestaurantStatus), default: RestaurantStatus.PENDING })
  status!: RestaurantStatus;
  @Prop({ default: 'International' })
  cuisine!: string;
  @Prop({ default: 0 })
  rating!: number;
  @Prop({ default: 0 })
  reviewCount!: number;
  @Prop({ type: [String], default: [] })
  amenities!: string[];
  @Prop({ type: [String], default: [] })
  verificationDocs!: string[];
}

export const restaurantSchema = SchemaFactory.createForClass(restaurant);

restaurantSchema.index({ status: 1, isApproved: 1, createdAt: -1, _id: -1 });
restaurantSchema.index({ ownerId: 1, createdAt: -1 });
