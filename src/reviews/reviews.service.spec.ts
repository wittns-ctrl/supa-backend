import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { review } from './schema/review.schema';
import { restaurant } from 'src/restaurants/schema/restaurant.schema';
import { order } from 'src/orders/schema/order.schema';
import { ReviewsService } from './reviews.service';

function mockModel() {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  return {
    find: jest.fn(() => chain),
    findOne: jest.fn(() => chain),
    findById: jest.fn(() => chain),
    findOneAndUpdate: jest.fn(() => chain),
    findByIdAndUpdate: jest.fn(() => chain),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  };
}

describe('ReviewsService', () => {
  let service: ReviewsService;

  const ReviewModel = mockModel();
  const RestaurantModel = mockModel();
  const OrderModel = mockModel();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getModelToken(review.name), useValue: ReviewModel },
        { provide: getModelToken(restaurant.name), useValue: RestaurantModel },
        { provide: getModelToken(order.name), useValue: OrderModel },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
