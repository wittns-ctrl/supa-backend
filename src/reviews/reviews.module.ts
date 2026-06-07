import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { review, reviewschema } from './schema/review.schema';
import { restaurant, restaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: review.name, schema: reviewschema },
      { name: restaurant.name, schema: restaurantSchema },
    ]),
    AuthModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
