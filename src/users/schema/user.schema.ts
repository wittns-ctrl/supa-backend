import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum roles {
  CUSTOMER = 'customer',
  OWNER = 'owner',
  ADMIN = 'admin',
}

@Schema()
export class Profile {
  @Prop()
  bio!: string;
  @Prop()
  imageurl!: string;
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
  @Prop()
  resetToken?: string;
  @Prop()
  resetTokenExpiration!: Date;
  @Prop()
  emailVerificationOtp?: string;
  @Prop()
  emailVerificationOtpExpires?: Date;
  @Prop({ type: Profile })
  profile?: Profile;
}

export const Userschema = SchemaFactory.createForClass(User);
