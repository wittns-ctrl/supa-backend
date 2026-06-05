import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { InjectModel } from '@nestjs/mongoose';
import { restaurant, restaurantDocument } from './schema/restaurant.schema';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/users/schema/user.schema';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectModel(restaurant.name)
    @InjectModel(User.name)
    private readonly restaurantModel: Model<restaurantDocument>,
    private readonly userModel: Model<UserDocument>
  ) {}

  async createRestaurant(createRestdto:CreateRestaurantDto) {

    const  user = await this.userModel.findById(createRestdto.ownerId)

    if(!user){
      throw new NotFoundException("user not found");
    }

    if(user.role !== 'owner'){
      throw new UnauthorizedException('You are not authorized for this action')
    }

    const restaurant = await this.restaurantModel.create({
      name:createRestdto.name,
      description:createRestdto.description,
      ownerId:createRestdto.ownerId,
      location:createRestdto.location,
      phone:createRestdto.phone,
      opening:createRestdto.opening,
      capacity:createRestdto.capacity,
      images:createRestdto.images
    })
    return 'restaurant created';
  }

  findAll() {
    return `This action returns all restaurants`;
  }

  findOne(id: number) {
    return `This action returns a #${id} restaurant`;
  }

  update(id: number, updateRestaurantDto: UpdateRestaurantDto) {
    return `This action updates a #${id} restaurant`;
  }

  remove(id: number) {
    return `This action removes a #${id} restaurant`;
  }
}
