import { SchemaFactory, Prop, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/users/schema/user.schema';

export type notificationDocument = notification & Document;

@Schema({ timestamps: true })
export class notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  message!: string;
  @Prop({ required: true })
  isRead!: boolean;
}

export const notificationschema = SchemaFactory.createForClass(notification);
