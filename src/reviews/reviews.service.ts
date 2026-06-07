import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { InjectModel } from '@nestjs/mongoose';
import { review, reviewDocument } from './schema/review.schema';
import { Model } from 'mongoose';
import { restaurant, restaurantDocument } from 'src/restaurants/schema/restaurant.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(review.name) private reviewModel: Model<reviewDocument>,
    @InjectModel(restaurant.name) private restaurantModel: Model<restaurantDocument>,
  ) {}

  async create(createReviewDto: CreateReviewDto) {
    const created = await this.reviewModel.create(createReviewDto);
    await this.updateRestaurantRating(createReviewDto.restaurantId);
    return this.formatReview(created);
  }

  async findAll(restaurantId?: string) {
    const filter = restaurantId ? { restaurantId } : {};
    const reviews = await this.reviewModel
      .find(filter)
      .populate('customerId', 'name')
      .sort({ createdAt: -1 });
    return reviews.map((r) => this.formatReview(r));
  }

  async findOne(id: string) {
    const item = await this.reviewModel.findById(id).populate('customerId', 'name');
    if (!item) throw new NotFoundException('Review not found');
    return this.formatReview(item);
  }

  async update(id: string, updateReviewDto: UpdateReviewDto) {
    const updated = await this.reviewModel.findByIdAndUpdate(id, updateReviewDto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Review not found');
    await this.updateRestaurantRating(updated.restaurantId.toString());
    return this.formatReview(updated);
  }

  async remove(id: string) {
    const deleted = await this.reviewModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Review not found');
    await this.updateRestaurantRating(deleted.restaurantId.toString());
    return { message: 'Review deleted' };
  }

  private async updateRestaurantRating(restaurantId: string) {
    const reviews = await this.reviewModel.find({ restaurantId });
    const avg =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length
        : 0;
    await this.restaurantModel.findByIdAndUpdate(restaurantId, {
      rating: Math.round(avg * 10) / 10,
      reviewCount: reviews.length,
    });
  }

  private formatReview(r: reviewDocument) {
    const obj = r.toObject();
    return {
      id: obj._id.toString(),
      restaurantId: obj.restaurantId.toString(),
      customerId: obj.customerId.toString(),
      customerName:
        typeof obj.customerId === 'object'
          ? (obj.customerId as { name?: string }).name
          : undefined,
      rating: obj.rating,
      comment: obj.comment,
      createdAt: obj.createdAt,
    };
  }
}
