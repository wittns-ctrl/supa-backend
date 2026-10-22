import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { User } from './schema/user.schema';
import { restaurant } from 'src/restaurants/schema/restaurant.schema';
import { order } from 'src/orders/schema/order.schema';
import { bookings } from 'src/bookings/schema/bookings.schema';
import { review } from 'src/reviews/schema/review.schema';
import { notification } from 'src/notifications/schema/notifications.schema';
import { UsersService } from './users.service';

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

describe('UsersService', () => {
  let service: UsersService;

  const UserModel = mockModel();
  const RestaurantModel = mockModel();
  const OrderModel = mockModel();
  const BookingsModel = mockModel();
  const ReviewModel = mockModel();
  const NotificationModel = mockModel();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: UserModel },
        { provide: getModelToken(restaurant.name), useValue: RestaurantModel },
        { provide: getModelToken(order.name), useValue: OrderModel },
        { provide: getModelToken(bookings.name), useValue: BookingsModel },
        { provide: getModelToken(review.name), useValue: ReviewModel },
        {
          provide: getModelToken(notification.name),
          useValue: NotificationModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
