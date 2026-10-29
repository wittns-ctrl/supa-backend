import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';

const ORDER_ID = new Types.ObjectId().toString();

function query<T>(result: T) {
  const q: any = {
    populate: () => q,
    select: () => q,
    sort: () => q,
    exec: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

const CAPTURED = {
  status: 'COMPLETED',
  purchase_units: [
    {
      payments: {
        captures: [
          { id: 'CAP-1', amount: { value: '10.00', currency_code: 'USD' } },
        ],
      },
    },
  ],
};

function build(claimResult: unknown) {
  const record = {
    _id: 'pay-1',
    orderId: ORDER_ID,
    status: 'pending',
    amount: 10,
    currency: 'USD',
  };
  const order = {
    id: ORDER_ID,
    _id: { toString: () => ORDER_ID },
    status: 'pending',
    customerId: { _id: { toString: () => 'user-1' }, email: 'c@example.com' },
    restaurantId: { toString: () => 'rest-1' },
    items: [],
  };
  const paymentModel = {
    findOne: jest.fn(() => query(record)),
    findOneAndUpdate: jest.fn(() => query(claimResult)),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const orderModel = { findById: jest.fn(() => query(order)) };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const mail = { sendPaymentReceipt: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(
    paymentModel as never,
    orderModel as never,
    notifications as never,
    mail as never,
  );
  jest
    .spyOn(service as any, 'paypalRequest')
    .mockResolvedValue(CAPTURED as never);
  return { service, paymentModel, notifications, mail };
}

describe('PaymentsService.capturePaypalOrder', () => {
  beforeAll(() => {
    process.env.PAYPAL_CLIENT_ID = 'test-id';
    process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
  });

  it('notifies and emails exactly once when this request wins the claim', async () => {
    const { service, paymentModel, notifications, mail } = build({
      _id: 'pay-1',
      status: 'paid',
    });

    const result = await service.capturePaypalOrder(
      'PP-1',
      'user-1',
      'customer',
    );

    expect(result).toMatchObject({ success: true, captureId: 'CAP-1' });
    // status flip and capture id are written in ONE atomic, guarded update
    const [filter, update] = (
      paymentModel.findOneAndUpdate.mock.calls as unknown[][]
    )[0] as [Record<string, unknown>, { $set: Record<string, unknown> }];
    expect(filter).toMatchObject({ _id: 'pay-1', status: 'pending' });
    expect(update.$set).toMatchObject({
      status: 'paid',
      transactionId: 'CAP-1',
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(mail.sendPaymentReceipt).toHaveBeenCalledTimes(1);
  });

  it('does not double-notify or double-email when a concurrent request already claimed it', async () => {
    const { service, notifications, mail } = build(null);

    const result = await service.capturePaypalOrder(
      'PP-1',
      'user-1',
      'customer',
    );

    expect(result).toMatchObject({ success: true });
    expect(notifications.create).not.toHaveBeenCalled();
    expect(mail.sendPaymentReceipt).not.toHaveBeenCalled();
  });
});
