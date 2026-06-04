import {Prop,SchemaFactory,Schema} from "@nestjs/mongoose";
import {Document} from "mongoose";

export type UserDocument  = User & Document;

export enum roles{
    CUSTOMER = "customer",
    OWNER = "owner",
    ADMIN = "admin"
}

@Schema()
export class Profile{
    @Prop()
    bio!:string
    @Prop()
    imageurl!:string
}

@Schema({timestamps:true})
export class User{
    @Prop({required:true})
    name!:string;
    @Prop({required:true,unique:true})
    email!:string;
    @Prop({required:true})
    password!:string;
    @Prop({required:true})
    phone!:string;
    @Prop({type:String,enums:roles,required:true})
    role!:roles;
    default!:roles.CUSTOMER
    @Prop({type:Profile})
    profile?:Profile;

}

export const Userschema = SchemaFactory.createForClass(User);