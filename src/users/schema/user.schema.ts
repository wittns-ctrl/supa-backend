import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum roles {
  CUSTOMER = 'customer',
  OWNER = 'owner',
  ADMIN = 'admin',
}

export enum AuthAccountType {
  CUSTOMER = 'customer',
  OWNER = 'owner',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

export enum RestaurantMembershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

@Schema({ _id: false })
export class RestaurantMembership {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'restaurant',
    required: true,
  })
  restaurantId!: Types.ObjectId;

  @Prop({ type: String, enum: ['owner'], default: 'owner', required: true })
  role!: string;

  @Prop({
    type: String,
    enum: Object.values(RestaurantMembershipStatus),
    default: RestaurantMembershipStatus.PENDING,
  })
  status!: RestaurantMembershipStatus;
}

@Schema({ _id: false })
export class AuthSession {
  @Prop({ required: true })
  sessionId!: string;

  @Prop({ required: true })
  refreshTokenHash!: string;

  @Prop()
  previousRefreshTokenHash?: string;

  @Prop()
  previousRefreshTokenExpiresAt?: Date;

  @Prop({ required: true })
  expiresAt!: Date;
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
  @Prop({ required: true })
  email!: string;
  @Prop({
    type: String,
    enum: Object.values(AuthAccountType),
    default: AuthAccountType.CUSTOMER,
    required: true,
  })
  accountType!: AuthAccountType;
  // The single administrator permitted to authenticate is provisioned by the
  // server bootstrap. This flag is never accepted from public signup/update DTOs.
  @Prop({ type: Boolean, default: false, select: false })
  isPrimaryAdmin?: boolean;
  @Prop()
  password?: string;
  // Phone stored as string — Numbers drop leading zeros and "+" country codes
  @Prop()
  phone?: string;
  @Prop({
    type: String,
    enum: Object.values(roles),
    required: true,
    default: roles.CUSTOMER,
    index: true,
  })
  role!: roles;
  @Prop({ required: true, default: false })
  isVerified!: boolean;
  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
    index: true,
  })
  status!: UserStatus;
  @Prop({ type: [RestaurantMembership], default: [] })
  restaurantMemberships!: RestaurantMembership[];
  @Prop({ type: [AuthSession], default: [] })
  authSessions!: AuthSession[];
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
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'restaurant' }],
    default: [],
  })
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
Userschema.index(
  { email: 1, accountType: 1 },
  { unique: true, name: 'email_account_type_unique' },
);
Userschema.index({ status: 1, role: 1, _id: 1 });
Userschema.index(
  { accountType: 1, isPrimaryAdmin: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accountType: AuthAccountType.ADMIN,
      isPrimaryAdmin: true,
    },
    name: 'single_primary_admin',
  },
);
