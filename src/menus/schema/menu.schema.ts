import {SchemaFactory,Prop,Schema} from "@nestjs/mongoose"
import  {Document,Types} from "mongoose";
import { restaurant } from "src/restaurants/schema/restaurant.schema";

export type menuDocument = menu & Document;

@Schema({timestamps:true})
export class menu{

    @Prop({type:Types.ObjectId,ref:restaurant.name,required:true})
    restaurant!:Types.ObjectId
    @Prop({required:true})
    name!:string
    @Prop({required:true})
    description!:string
    @Prop({required:true})
    price!:Number
    @Prop({required:true})
    category!:string
    @Prop({required:true})
    image!:string
    @Prop({required:true})
    isAvailable!:boolean

}


export const menuschema = SchemaFactory.createForClass(menu)