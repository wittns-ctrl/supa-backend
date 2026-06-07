import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { User, Userschema } from 'src/users/schema/user.schema';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { menu, menuschema } from 'src/menus/schema/menu.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: Userschema },
      { name: restaurant.name, schema: restaurantSchema },
      { name: menu.name, schema: menuschema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
