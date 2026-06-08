import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum roles {
  CUSTOMER = 'customer',
  OWNER = 'owner',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

@Schema()
export class Profile {
  @Prop()
  bio!: string;
  @Prop()
  imageurl!: string;
}

@Schema({ _id: false })
export class DeliveryAddress {
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

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name!: string;
  @Prop({ required: true, unique: true })
  email!: string;
  @Prop({ required: true })
  password!: string;
  @Prop({ required: true })
  phone!: Number;
  @Prop({ type: String, enum: Object.values(roles), required: true })
  role!: roles;
  @Prop({ required: true })
  isVerified!: boolean;
  @Prop({ type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE })
  status!: UserStatus;
  @Prop()
  refreshToken?: string;
  @Prop()
  resetToken?: string;
  @Prop()
  resetTokenExpiration?: Date;
  @Prop()
  emailVerificationOtp?: string;
  @Prop()
  emailVerificationOtpExpires?: Date;
  @Prop({ type: Profile })
  profile?: Profile;
  @Prop({ type: DeliveryAddress })
  deliveryAddress?: DeliveryAddress;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'restaurant' }], default: [] })
  favorites!: Types.ObjectId[];
}

export const Userschema = SchemaFactory.createForClass(User);
