import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';

function query<T>(result: T) {
  const q: any = {
    select: () => q,
    populate: () => q,
    exec: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

const RESTAURANT_ID = new Types.ObjectId();
const CUSTOMER_ID = new Types.ObjectId().toString();
const MENU_ID = new Types.ObjectId();

function build(restaurant: Record<string, unknown> | null) {
  const menuItem = {
    _id: MENU_ID,
    name: 'Jollof',
    price: 0.1,
    isAvailable: true,
    restaurant: RESTAURANT_ID,
  };
  const orderModel = {
    create: jest.fn(async (doc: Record<string, any>) => ({
      ...doc,
      _id: new Types.ObjectId(),
      items: doc.items,
      toObject() {
        return { ...doc, _id: this._id };
      },
    })),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(
    orderModel as never,
    { find: jest.fn(() => query([menuItem])) } as never,
    { findById: jest.fn(() => query(restaurant)) } as never,
    {} as never,
    { findById: jest.fn(() => query({ name: 'Cust' })) } as never,
    notifications as never,
    {} as never,
    {} as never,
  );
  return { service, orderModel, notifications };
}

const dto = () => ({
  customerId: CUSTOMER_ID,
  restaurantId: RESTAURANT_ID.toString(),
  items: [{ menuItemId: MENU_ID.toString(), qty: 3 }],
  deliveryAddress: {
    street: '12 Market Street',
    city: 'Kigali',
    postalCode: '00100',
    phone: '+250788123456',
  },
  timeSlot: '7:00 PM',
});

const liveRestaurant = {
  _id: RESTAURANT_ID,
  name: 'Test Bistro',
  status: 'active',
  isApproved: true,
  ownerId: { toString: () => 'owner-1' },
};

describe('OrdersService.create', () => {
  it('refuses orders for a restaurant that is not active and approved', async () => {
    const { service, orderModel } = build({
      ...liveRestaurant,
      status: 'suspended',
      isApproved: false,
    });

    await expect(
      service.create(dto() as never, CUSTOMER_ID, 'customer'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderModel.create).not.toHaveBeenCalled();
  });

  it('refuses orders for a restaurant that does not exist (nothing is persisted)', async () => {
    const { service, orderModel } = build(null);

    await expect(
      service.create(dto() as never, CUSTOMER_ID, 'customer'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderModel.create).not.toHaveBeenCalled();
  });

  it('rounds the subtotal to cents (0.1 x 3 is 0.30000000000000004 in floats)', async () => {
    const { service, orderModel } = build(liveRestaurant);

    await service.create(dto() as never, CUSTOMER_ID, 'customer');

    const stored = (orderModel.create.mock.calls as unknown[][])[0][0] as {
      subtotal: number;
      total: number;
    };
    expect(stored.subtotal).toBe(0.3);
    expect(stored.total).toBe(4.29);
  });

  it('still places the order when a notification cannot be delivered', async () => {
    const { service, notifications } = build(liveRestaurant);
    notifications.create.mockRejectedValue(new Error('notifications down'));

    await expect(
      service.create(dto() as never, CUSTOMER_ID, 'customer'),
    ).resolves.toMatchObject({ status: 'pending' });
  });
});
