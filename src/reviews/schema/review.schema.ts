import {SchemaFactory,Schema,Prop} from '@nestjs/mongoose';
import {Document,Types} from "mongoose"
import { User } from 'src/users/schema/user.schema';
import { restaurant } from 'src/restaurants/schema/restaurant.schema';

export type reviewDocument = review & Document;

@Schema({timestamps:true})
export class review{
    @Prop({type:Types.ObjectId,ref:restaurant.name,required:true})
    restaurnatId!:Types.ObjectId
    @Prop({type:Types.ObjectId,ref:User.name,required:true})
    customerId!:Types.ObjectId
    @Prop({required:true})
    rating!:Number
    @Prop({required:true})
    comment!:string
}

export const reviewschema = SchemaFactory.createForClass(review)