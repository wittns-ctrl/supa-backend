import { Module } from '@nestjs/common';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { menu, menuschema } from './schema/menu.schema';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: menu.name, schema: menuschema },
      { name: restaurant.name, schema: restaurantSchema },
    ]),
    AuthModule,
  ],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
