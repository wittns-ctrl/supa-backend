import {Document, Types} from "mongoose";
import {Prop,SchemaFactory,Schema} from "@nestjs/mongoose";
import { User } from "src/users/schema/user.schema";

export type restaurantDocument = restaurant & Document;

export class Location{
    @Prop({required:true})
    address!:string;
    @Prop({required:true})
    city!:string;
    @Prop({required:true})
    latitude!:Number
    @Prop({required:true})
    longitude!:Number
}

@Schema({timestamps:true})
export class restaurant{
    @Prop({required:true})
    name!:string;
    @Prop({required:true})
    description!:true;
    @Prop({type: Types.ObjectId,ref:User.name,required:true})
    ownerId!:Types.ObjectId;
    @Prop({type:Location,required:true})
    location!:Location
    @Prop({required:true})
    phone!:string
    @Prop({required:true})
    opening!:string
    @Prop({requred:true})
    capacity!:Number
    @Prop({type:[String],default:[]})
    images!:string[]
    @Prop({required:true})
    isApproved!:boolean
}

export const restaurantSchema = SchemaFactory.createForClass(restaurant)
