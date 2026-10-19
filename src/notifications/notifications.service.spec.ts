import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { notification } from './schema/notifications.schema';
import { NotificationsService } from './notifications.service';
import { User } from 'src/users/schema/user.schema';

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

describe('NotificationsService', () => {
  let service: NotificationsService;

  const NotificationModel = mockModel();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(notification.name), useValue: NotificationModel },
        { provide: getModelToken(User.name), useValue: mockModel() },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
