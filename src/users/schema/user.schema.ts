import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

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
  @Prop({ required: true, unique: true, index: true })
  email!: string;
  @Prop()
  password?: string;
  // Phone stored as string — Numbers drop leading zeros and "+" country codes
  @Prop()
  phone?: string;
  @Prop({ type: String, enum: Object.values(roles), required: true, default: roles.CUSTOMER, index: true })
  role!: roles;
  @Prop({ required: true, default: false })
  isVerified!: boolean;
  @Prop({ type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE, index: true })
  status!: UserStatus;
  @Prop()
  refreshToken?: string;
  // #25: the previously-rotated-out refresh token, honored for a short grace
  // window so two tabs refreshing concurrently don't revoke each other.
  @Prop()
  previousRefreshToken?: string;
  @Prop()
  previousRefreshTokenExpiresAt?: Date;
  // Index declared below with sparse: true (most users never have one)
  @Prop()
  resetToken?: string;
  @Prop()
  resetTokenExpiration?: Date;
  @Prop()
  emailVerificationOtp?: string;
  @Prop()
  emailVerificationOtpExpires?: Date;
  @Prop({ default: 0 })
  emailVerificationOtpAttempts?: number;
  @Prop({ type: Profile })
  profile?: Profile;
  @Prop({ type: DeliveryAddress })
  deliveryAddress?: DeliveryAddress;
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'restaurant' }], default: [] })
  favorites!: Types.ObjectId[];
  // OAuth fields
  @Prop()
  oauthProvider?: string;
  @Prop()
  oauthProviderId?: string;
}

export const Userschema = SchemaFactory.createForClass(User);

// Lookup by hashed refresh/reset/OTP tokens must be fast and indexed
Userschema.index({ resetToken: 1 }, { sparse: true });
