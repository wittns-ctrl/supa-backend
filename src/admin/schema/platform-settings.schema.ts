import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformSettingsDocument = PlatformSettings & Document;

@Schema({ timestamps: true })
export class PlatformSettings {
  @Prop({ default: 'SupaMeal' })
  platformName!: string;
  @Prop({ default: 'support@supameal.com' })
  supportEmail!: string;
  @Prop({ default: 10 })
  commissionRate!: number;
  @Prop({ default: 3 })
  maxRestaurantsPerOwner!: number;
  @Prop({ default: false })
  maintenanceMode!: boolean;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
