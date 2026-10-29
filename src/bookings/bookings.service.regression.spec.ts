import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingsService } from './bookings.service';

function query<T>(result: T) {
  const q: any = {
    populate: () => q,
    select: () => q,
    exec: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

const RESTAURANT_ID = new Types.ObjectId();
const OWNER_ID = 'owner-1';

function restaurantDoc(capacity = 50) {
  return {
    _id: RESTAURANT_ID,
    name: 'Test Bistro',
    status: 'active',
    capacity,
    ownerId: { toString: () => OWNER_ID },
    location: { address: '1 Main St', city: 'Kigali' },
  };
}

function bookingDoc(overrides: Record<string, unknown> = {}) {
  const base: Record<string, any> = {
    _id: new Types.ObjectId(),
    restaurantId: RESTAURANT_ID,
    customerId: new Types.ObjectId(),
    bookingDate: new Date('2020-01-01T00:00:00Z'),
    bookingTime: '19:00',
    guests: 4,
    status: 'confirmed',
    ...overrides,
  };
  base.toObject = () => ({ ...base });
  return base;
}

function build(seatsTaken = 0) {
  const aggregate = jest.fn(() => ({
    exec: () => Promise.resolve([{ seats: seatsTaken }]),
  }));
  const bookingsModel: Record<string, jest.Mock> = {
    aggregate,
    create: jest.fn(async (doc: Record<string, any>) => ({
      ...doc,
      _id: new Types.ObjectId(),
      toObject() {
        return { ...doc, _id: this._id };
      },
    })),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const restaurantModel = {
    findById: jest.fn(() => query(restaurantDoc())),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const service = new BookingsService(
    bookingsModel as never,
    restaurantModel as never,
    {} as never,
    notifications as never,
    { isConfigured: false } as never,
  );
  return { service, bookingsModel, notifications };
}

function tomorrowIsoDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('BookingsService regressions', () => {
  it('counts already-booked seats using an ObjectId (aggregate does not auto-cast)', async () => {
    const { service, bookingsModel } = build(48);

    // Capacity 50, 48 seats taken, party of 5 → must be refused. Before the
    // fix the string restaurantId never matched, seatsTaken was always 0 and
    // the capacity check silently never fired.
    await expect(
      service.create({
        customerId: new Types.ObjectId().toString(),
        restaurantId: RESTAURANT_ID.toString(),
        bookingDate: tomorrowIsoDate(),
        bookingTime: '19:00',
        guests: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const pipeline = (
      bookingsModel.aggregate.mock.calls as unknown[][]
    )[0][0] as {
      $match: { restaurantId: unknown };
    }[];
    expect(pipeline[0].$match.restaurantId).toBeInstanceOf(Types.ObjectId);
  });

  it('accepts a booking that fits the remaining capacity', async () => {
    const { service } = build(10);

    await expect(
      service.create({
        customerId: new Types.ObjectId().toString(),
        restaurantId: RESTAURANT_ID.toString(),
        bookingDate: tomorrowIsoDate(),
        bookingTime: '19:00',
        guests: 4,
      }),
    ).resolves.toMatchObject({ guests: 4, backendStatus: 'pending' });
  });

  it('lets the owner complete a booking whose date is already in the past', async () => {
    const { service, bookingsModel } = build();
    const existing = bookingDoc();
    bookingsModel.findById.mockResolvedValue(existing);
    bookingsModel.findByIdAndUpdate.mockReturnValue(
      query(bookingDoc({ _id: existing._id, status: 'completed' })),
    );

    // Previously rejected with "Booking date cannot be in the past" because the
    // untouched date was re-validated on every status change.
    await expect(
      service.update(
        existing._id.toString(),
        { status: 'completed' as never },
        OWNER_ID,
        'owner',
      ),
    ).resolves.toMatchObject({ backendStatus: 'completed' });
  });

  it('does not run a capacity check when only the status is released', async () => {
    const { service, bookingsModel } = build(50);
    const existing = bookingDoc({ bookingDate: new Date(Date.now() + 864e5) });
    bookingsModel.findById.mockResolvedValue(existing);
    bookingsModel.findByIdAndUpdate.mockReturnValue(
      query(bookingDoc({ _id: existing._id, status: 'cancelled' })),
    );

    // A fully-booked day must not stop a booking from being cancelled.
    await expect(
      service.update(
        existing._id.toString(),
        { status: 'cancelled' as never },
        OWNER_ID,
        'owner',
      ),
    ).resolves.toBeDefined();
    expect(bookingsModel.aggregate).not.toHaveBeenCalled();
  });

  it('strips owner-only note fields from a customer edit', async () => {
    const { service, bookingsModel } = build();
    const customerId = new Types.ObjectId();
    const existing = bookingDoc({
      customerId,
      status: 'pending',
      bookingDate: new Date(Date.now() + 864e5),
    });
    bookingsModel.findById.mockResolvedValue(existing);
    bookingsModel.findByIdAndUpdate.mockReturnValue(query(existing));

    await service.update(
      existing._id.toString(),
      {
        specialRequest: 'Window seat',
        ownerNote: 'Pre-paid',
        rejectionReason: 'x',
      },
      customerId.toString(),
      'customer',
    );

    const patch = (
      bookingsModel.findByIdAndUpdate.mock.calls as unknown[][]
    )[0][1] as Record<string, unknown>;
    expect(patch.specialRequest).toBe('Window seat');
    expect(patch).not.toHaveProperty('ownerNote');
    expect(patch).not.toHaveProperty('rejectionReason');
  });
});
