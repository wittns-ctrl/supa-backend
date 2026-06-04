import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import {review,reviewschema} from './schema/review.schema';
import {MongooseModule} from "@nestjs/mongoose";

@Module({
  imports:[MongooseModule.forFeature([{name:review.name,schema:reviewschema}])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
