import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { restaurant } from './schema/restaurant.schema';
import { User } from 'src/users/schema/user.schema';
import { order } from 'src/orders/schema/order.schema';
import { bookings } from 'src/bookings/schema/bookings.schema';
import { menu } from 'src/menus/schema/menu.schema';
import { RestaurantsService } from './restaurants.service';

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

describe('RestaurantsService', () => {
  let service: RestaurantsService;

  const RestaurantModel = mockModel();
  const UserModel = mockModel();
  const OrderModel = mockModel();
  const BookingsModel = mockModel();
  const MenuModel = mockModel();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: getModelToken(restaurant.name), useValue: RestaurantModel },
        { provide: getModelToken(User.name), useValue: UserModel },
        { provide: getModelToken(order.name), useValue: OrderModel },
        { provide: getModelToken(bookings.name), useValue: BookingsModel },
        { provide: getModelToken(menu.name), useValue: MenuModel },
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
