import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from 'src/users/schema/user.schema';

export type notificationDocument = notification & Document;

@Schema({ timestamps: true })
export class notification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  message!: string;
  @Prop({ required: true, default: false })
  isRead!: boolean;
}

export const notificationschema = SchemaFactory.createForClass(notification);

notificationschema.index({ userId: 1, isRead: 1, createdAt: -1 });
