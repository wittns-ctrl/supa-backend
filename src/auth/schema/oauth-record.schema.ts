import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class OAuthStateRecord {
  @Prop({ required: true, unique: true })
  state!: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const OAuthStateRecordSchema =
  SchemaFactory.createForClass(OAuthStateRecord);
OAuthStateRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true })
export class OAuthCodeRecord {
  @Prop({ required: true, unique: true })
  codeHash!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  result!: Record<string, unknown>;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const OAuthCodeRecordSchema =
  SchemaFactory.createForClass(OAuthCodeRecord);
OAuthCodeRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
