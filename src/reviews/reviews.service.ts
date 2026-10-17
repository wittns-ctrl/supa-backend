import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { InjectModel } from '@nestjs/mongoose';
import { review, reviewDocument } from './schema/review.schema';
import { Model, Types } from 'mongoose';
import { restaurant, restaurantDocument } from 'src/restaurants/schema/restaurant.schema';
import { order, orderDocument } from 'src/orders/schema/order.schema';
import { roles } from 'src/users/schema/user.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(review.name) private reviewModel: Model<reviewDocument>,
    @InjectModel(restaurant.name) private restaurantModel: Model<restaurantDocument>,
    @InjectModel(order.name) private orderModel: Model<orderDocument>,
  ) {}

  async create(
    createReviewDto: CreateReviewDto,
    userId?: string,
    userRole?: string,
  ) {
    if (userRole === roles.CUSTOMER && userId) {
      createReviewDto.customerId = userId;
    }

    if (!Types.ObjectId.isValid(createReviewDto.restaurantId)) {
      throw new BadRequestException('Invalid restaurant id');
    }
    if (!createReviewDto.customerId || !Types.ObjectId.isValid(createReviewDto.customerId)) {
      throw new BadRequestException('Invalid customer id');
    }
    const rating = Number(createReviewDto.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    // Purchase verification: customers can only review restaurants they have
    // actually ordered from (delivered order required).
    if (userRole === roles.CUSTOMER) {
      const hasDeliveredOrder = await this.orderModel.exists({
        customerId: new Types.ObjectId(createReviewDto.customerId),
        restaurantId: new Types.ObjectId(createReviewDto.restaurantId),
        status: 'delivered' as any,
      });
      if (!hasDeliveredOrder) {
        throw new BadRequestException(
          'You can only review restaurants you have ordered from',
        );
      }
      // One review per customer per restaurant
      const existing = await this.reviewModel.findOne({
        customerId: createReviewDto.customerId,
        restaurantId: createReviewDto.restaurantId,
      });
      if (existing) {
        throw new BadRequestException('You have already reviewed this restaurant');
      }
    }

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

  async update(id: string, updateReviewDto: UpdateReviewDto, userId: string, userRole: string) {
    const updated = await this.reviewModel.findById(id);
    if (!updated) throw new NotFoundException('Review not found');

    if (userRole !== 'admin' && updated.customerId.toString() !== userId) {
      throw new UnauthorizedException('You are not authorized to update this review');
    }

    const saved = await this.reviewModel.findByIdAndUpdate(id, updateReviewDto, {
      returnDocument: 'after',
    });
    if (!saved) throw new NotFoundException('Review not found');
    await this.updateRestaurantRating(saved.restaurantId.toString());
    return this.formatReview(saved);
  }

  async remove(id: string, userId: string, userRole: string) {
    const deleted = await this.reviewModel.findById(id);
    if (!deleted) throw new NotFoundException('Review not found');

    if (userRole !== 'admin' && deleted.customerId.toString() !== userId) {
      throw new UnauthorizedException('You are not authorized to delete this review');
    }

    await this.reviewModel.findByIdAndDelete(id);
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
