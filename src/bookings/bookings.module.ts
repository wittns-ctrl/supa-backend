import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import {MongooseModule} from "@nestjs/mongoose"
import { bookingschema,bookings } from './schema/bookings.schema';

@Module({
  imports:[MongooseModule.forFeature([{name:bookings.name,schema:bookingschema}])],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
