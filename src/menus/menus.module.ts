import { Module } from '@nestjs/common';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';
import {MongooseModule} from '@nestjs/mongoose'
import { menu } from './schema/menu.schema';
import { menuschema } from './schema/menu.schema';

@Module({
  imports:[MongooseModule.forFeature([{name:menu.name,schema:menuschema}])],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}
