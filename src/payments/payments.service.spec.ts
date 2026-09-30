import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { payment } from './schema/payments.schema';
import { order } from 'src/orders/schema/order.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { MailService } from 'src/mail/mail.service';
import { PaymentsService } from './payments.service';

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

describe('PaymentsService', () => {
  let service: PaymentsService;

  const PaymentModel = mockModel();
  const OrderModel = mockModel();
  const notificationsService = {};
  const mailservice = { sendPaymentReceipt: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(payment.name), useValue: PaymentModel },
        { provide: getModelToken(order.name), useValue: OrderModel },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: MailService, useValue: mailservice },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
