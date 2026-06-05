export class CreateRestaurantDto {
    name!:string;
    description!:string;
    ownerId!:string
    location!:{string};
    phone!:Number;
    opening!:string;
    capacity!:Number
    images!:string[];
}
