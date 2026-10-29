import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { Model, Types } from 'mongoose';
import {
  bookings,
  bookingsDocument,
  reviewsEnums,
} from './schema/bookings.schema';
import { InjectModel } from '@nestjs/mongoose';
import {
  restaurant,
  restaurantDocument,
} from 'src/restaurants/schema/restaurant.schema';
import { User, UserDocument } from 'src/users/schema/user.schema';
import { roles } from 'src/users/schema/user.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { RedisService } from 'src/redis/redis.service';

// Strict 24-hour HH:MM — the old /^\d{1,2}:\d{2}$/ accepted "99:99"
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class BookingsService {
  // Serialize check-then-write per restaurant+date. Configured deployments use
  // a shared Redis lock; the in-process mutex is only the local-dev fallback.
  private readonly dayLocks = new Map<string, Promise<unknown>>();

  private async withDayLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.dayLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => gate);
    this.dayLocks.set(key, tail);
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.dayLocks.get(key) === tail) this.dayLocks.delete(key);
    }
  }

  // Booking dates arrive as ISO strings (usually date-only, i.e. UTC midnight),
  // so every day boundary is computed in UTC. Local-time getters shifted the
  // day on any server not running in UTC and mis-rejected same-day bookings.
  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private dayRange(date: Date) {
    const start = this.startOfUtcDay(date);
    return { $gte: start, $lt: new Date(start.getTime() + 86_400_000) };
  }

  private dayKey(restaurantId: string, date: Date) {
    return `${restaurantId}:${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
  }

  private assertBookableDate(date: Date) {
    if (date < this.startOfUtcDay(new Date())) {
      throw new BadRequestException('Booking date cannot be in the past');
    }
    const maxDate = new Date();
    maxDate.setUTCDate(maxDate.getUTCDate() + 90);
    if (date > maxDate) {
      throw new BadRequestException(
        'Bookings can only be made up to 90 days in advance',
      );
    }
  }

  // One locking strategy for every capacity-sensitive write: a shared Redis
  // lock across API replicas, falling back to the in-process mutex locally.
  private runLocked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.redis.isConfigured
      ? this.redis.withLock(`booking:${key}`, fn)
      : this.withDayLock(key, fn);
  }

  private async sumActiveSeats(
    filter: Record<string, unknown>,
  ): Promise<number> {
    const [result] = await this.bookingsModel
      .aggregate([
        { $match: filter },
        { $group: { _id: null, seats: { $sum: { $toDouble: '$guests' } } } },
      ])
      .exec();
    return Number(result?.seats || 0);
  }

  constructor(
    @InjectModel(bookings.name)
    private readonly bookingsModel: Model<bookingsDocument>,
    @InjectModel(restaurant.name)
    private readonly restaurantModel: Model<restaurantDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  async create(createBookingDto: CreateBookingDto) {
    const customerId = createBookingDto.customerId;
    if (!customerId || !Types.ObjectId.isValid(customerId)) {
      throw new BadRequestException('Invalid customer id');
    }
    if (!Types.ObjectId.isValid(createBookingDto.restaurantId)) {
      throw new BadRequestException('Invalid restaurant id');
    }

    const restaurantDoc = await this.restaurantModel.findById(
      createBookingDto.restaurantId,
    );
    if (!restaurantDoc) throw new NotFoundException('Restaurant not found');
    if (restaurantDoc.status !== 'active') {
      throw new BadRequestException(
        'This restaurant is not accepting bookings',
      );
    }

    const bookingDate = new Date(createBookingDto.bookingDate);
    if (Number.isNaN(bookingDate.getTime())) {
      throw new BadRequestException('Invalid booking date');
    }
    // Bookings must be in the future (same day allowed) and within 90 days
    this.assertBookableDate(bookingDate);

    if (!TIME_REGEX.test(createBookingDto.bookingTime || '')) {
      throw new BadRequestException(
        'bookingTime must be a valid time in HH:MM format',
      );
    }

    const guests = Number(createBookingDto.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 50) {
      throw new BadRequestException('Guests must be between 1 and 50');
    }
    if (restaurantDoc.capacity && guests > Number(restaurantDoc.capacity)) {
      throw new BadRequestException(
        `Party size exceeds restaurant capacity (${restaurantDoc.capacity})`,
      );
    }

    // Count confirmed/pending seats for this date — refuse if the restaurant
    // would be over capacity. Locked per restaurant+day so concurrent requests
    // serialize on the read-then-insert.
    const dayKey = this.dayKey(createBookingDto.restaurantId, bookingDate);
    const createWithinLock = async () => {
      const seatsTaken = await this.sumActiveSeats({
        restaurantId: new Types.ObjectId(createBookingDto.restaurantId),
        bookingDate: this.dayRange(bookingDate),
        status: { $in: [reviewsEnums.PENDING, reviewsEnums.CONFIRMED] },
      });
      if (
        restaurantDoc.capacity &&
        seatsTaken + guests > Number(restaurantDoc.capacity)
      ) {
        throw new BadRequestException(
          'No availability for this date — the restaurant is fully booked',
        );
      }

      const created = await this.bookingsModel.create({
        ...createBookingDto,
        customerId,
        guests,
        bookingDate,
        specialRequest: createBookingDto.specialRequest || '',
        status: reviewsEnums.PENDING,
      });

      await this.notificationsService.create({
        userId: restaurantDoc.ownerId.toString(),
        title: 'New Table Booking',
        message: `New booking request for ${restaurantDoc.name}`,
      });

      return this.formatBooking(created);
    };

    return this.runLocked(dayKey, createWithinLock);
  }

  async findAll(
    customerId?: string,
    restaurantId?: string,
    userId?: string,
    userRole?: string,
    page = 1,
    limit = 20,
  ) {
    // DB-level scoping instead of fetch-all-then-filter
    const filter: Record<string, unknown> = {};

    if (userRole === roles.ADMIN) {
      if (customerId) filter.customerId = customerId;
      if (restaurantId) filter.restaurantId = restaurantId;
    } else if (userRole === roles.OWNER) {
      const owned = await this.restaurantModel
        .find({ ownerId: userId })
        .select('_id');
      const ownedIds = owned.map((r) => r._id);
      if (restaurantId) {
        if (!ownedIds.some((id) => id.toString() === restaurantId)) {
          throw new UnauthorizedException(
            'You are not authorized to view these bookings',
          );
        }
        filter.restaurantId = restaurantId;
      } else {
        filter.restaurantId = { $in: ownedIds };
      }
      if (customerId) filter.customerId = customerId;
    } else {
      filter.customerId = userId;
      filter.hiddenForCustomer = { $ne: true };
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);

    const [items, totalCount] = await Promise.all([
      this.bookingsModel
        .find(filter)
        .populate('restaurantId', 'name location cuisine ownerId')
        .populate('customerId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      this.bookingsModel.countDocuments(filter),
    ]);

    const formatted = await Promise.all(
      items.map((b) => this.formatBooking(b)),
    );
    return {
      data: formatted,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / safeLimit),
      },
    };
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid booking id');
    }
    const booking = await this.bookingsModel
      .findById(id)
      .populate('restaurantId', 'name location cuisine ownerId')
      .populate('customerId', 'name email phone');
    if (!booking) throw new NotFoundException('Booking not found');

    const grantedRoles = new Set((userRole || '').split(','));
    const restaurant =
      booking.restaurantId && typeof booking.restaurantId === 'object'
        ? (booking.restaurantId as { ownerId?: Types.ObjectId })
        : null;
    const isOwner =
      grantedRoles.has(roles.OWNER) &&
      restaurant?.ownerId?.toString() === userId;
    const customerRef = booking.customerId as any;
    const customerId =
      customerRef?._id?.toString?.() || customerRef?.toString?.();
    if (
      grantedRoles.has(roles.CUSTOMER) &&
      !isOwner &&
      customerId === userId &&
      booking.hiddenForCustomer
    ) {
      throw new NotFoundException('Booking not found');
    }

    await this.assertCanAccessBooking(booking, userId, userRole);
    return this.formatBooking(booking);
  }

  async update(
    id: string,
    updateBookingDto: UpdateBookingDto,
    userId?: string,
    userRole?: string,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid booking id');
    }
    const existing = await this.bookingsModel.findById(id);
    if (!existing) throw new NotFoundException('Booking not found');

    await this.assertCanAccessBookingId(existing, userId, userRole);

    const grantedRoles = new Set((userRole || '').split(','));
    const existingRestaurant = await this.restaurantModel.findById(
      existing.restaurantId,
    );
    const isOwner =
      grantedRoles.has(roles.OWNER) &&
      existingRestaurant?.ownerId?.toString() === userId;
    if (
      updateBookingDto.status &&
      grantedRoles.has(roles.CUSTOMER) &&
      !isOwner
    ) {
      if (updateBookingDto.status !== reviewsEnums.CANCELLED) {
        throw new UnauthorizedException('Customers can only cancel bookings');
      }
    }

    // Identity fields cannot be moved to another booking — a change of
    // restaurant/customer is a new booking, not an edit (prevents cross-
    // restaurant moves that would bypass the capacity check). Owner is
    // implicit from the JWT caller; never accepted from the body.
    delete updateBookingDto.customerId;
    delete updateBookingDto.restaurantId;

    const isAdmin = grantedRoles.has(roles.ADMIN);
    if (!isOwner && !isAdmin) {
      // Only the restaurant may post notes/reasons that the customer sees as
      // coming from the restaurant.
      delete updateBookingDto.ownerNote;
      delete updateBookingDto.rejectionReason;
      // Customers can't edit a booking that is already finished or cancelled.
      if (
        existing.status !== reviewsEnums.PENDING &&
        existing.status !== reviewsEnums.CONFIRMED
      ) {
        throw new BadRequestException(
          `A booking in status "${existing.status}" can no longer be changed`,
        );
      }
    }

    // Only re-validate what the caller is actually changing. Re-checking the
    // untouched date made it impossible for an owner to confirm/complete a
    // booking once its day had arrived or passed.
    const dateChanged = Boolean(updateBookingDto.bookingDate);
    const nextDate = dateChanged
      ? new Date(updateBookingDto.bookingDate as string)
      : new Date(existing.bookingDate);
    if (Number.isNaN(nextDate.getTime())) {
      throw new BadRequestException('Invalid booking date');
    }
    if (dateChanged) this.assertBookableDate(nextDate);

    if (
      updateBookingDto.bookingTime !== undefined &&
      !TIME_REGEX.test(updateBookingDto.bookingTime || '')
    ) {
      throw new BadRequestException(
        'bookingTime must be a valid time in HH:MM format',
      );
    }

    const guestsChanged = updateBookingDto.guests !== undefined;
    const nextGuests = guestsChanged
      ? Number(updateBookingDto.guests)
      : Number(existing.guests);
    if (
      guestsChanged &&
      (!Number.isInteger(nextGuests) || nextGuests < 1 || nextGuests > 50)
    ) {
      throw new BadRequestException('Guests must be between 1 and 50');
    }

    const restaurantDoc = existingRestaurant;
    if (
      guestsChanged &&
      restaurantDoc?.capacity &&
      nextGuests > Number(restaurantDoc.capacity)
    ) {
      throw new BadRequestException(
        `Party size exceeds restaurant capacity (${restaurantDoc.capacity})`,
      );
    }

    const isActiveStatus = (status?: string) =>
      status === reviewsEnums.PENDING || status === reviewsEnums.CONFIRMED;
    const nextStatus = updateBookingDto.status ?? existing.status;
    // Seats only need re-checking when this edit can add load to a day:
    // moving the date, adding guests, or re-activating a released booking.
    const needsCapacityCheck =
      isActiveStatus(nextStatus) &&
      (dateChanged || guestsChanged || !isActiveStatus(existing.status));

    // Capacity check + write under the same per-day lock as create() so an
    // edit racing a new booking can't overcommit the restaurant.
    return this.runLocked(
      this.dayKey(existing.restaurantId.toString(), nextDate),
      async () => {
        if (needsCapacityCheck && restaurantDoc?.capacity) {
          // Capacity check against other active bookings on that date — excluding
          // this booking itself from the sum.
          const seatsTaken = await this.sumActiveSeats({
            _id: { $ne: existing._id },
            restaurantId: existing.restaurantId,
            bookingDate: this.dayRange(nextDate),
            status: { $in: [reviewsEnums.PENDING, reviewsEnums.CONFIRMED] },
          });
          if (seatsTaken + nextGuests > Number(restaurantDoc.capacity)) {
            throw new BadRequestException(
              'No availability for this date — the restaurant is fully booked',
            );
          }
        }

        const updated = await this.bookingsModel
          .findByIdAndUpdate(
            id,
            {
              ...updateBookingDto,
              ...(dateChanged ? { bookingDate: nextDate } : {}),
              ...(guestsChanged ? { guests: nextGuests } : {}),
            },
            { returnDocument: 'after' },
          )
          .populate('restaurantId', 'name')
          .populate('customerId', 'name email');

        if (!updated) throw new NotFoundException('Booking not found');

        if (updateBookingDto.status && updated.customerId) {
          const customerId =
            typeof updated.customerId === 'object'
              ? (updated.customerId as { _id: Types.ObjectId })._id.toString()
              : String(updated.customerId);
          await this.notificationsService.create({
            userId: customerId,
            title: 'Booking Update',
            message: `Your booking status is now: ${updateBookingDto.status}`,
          });
        }

        return this.formatBooking(updated);
      },
    );
  }

  async remove(id: string, userId: string, userRole: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid booking id');
    }
    const booking = await this.bookingsModel.findById(id);
    if (!booking) throw new NotFoundException('Booking not found');

    // Terminal states are final — a completed/cancelled booking can't be "re-cancelled"
    if (
      booking.status !== reviewsEnums.PENDING &&
      booking.status !== reviewsEnums.CONFIRMED
    ) {
      throw new BadRequestException(
        `A booking in status "${booking.status}" cannot be cancelled`,
      );
    }

    const customerId = booking.customerId.toString();
    const restaurant = await this.restaurantModel.findById(
      booking.restaurantId,
    );
    const ownerId = restaurant?.ownerId?.toString();

    const grantedRoles = new Set((userRole || '').split(','));
    const isCustomer =
      grantedRoles.has(roles.CUSTOMER) && customerId === userId;
    const isOwner = grantedRoles.has(roles.OWNER) && ownerId === userId;
    const isAdmin = grantedRoles.has(roles.ADMIN);
    if (!isCustomer && !isOwner && !isAdmin) {
      throw new UnauthorizedException(
        'You are not authorized to cancel this booking',
      );
    }

    const updated = await this.bookingsModel.findByIdAndUpdate(
      id,
      { status: reviewsEnums.CANCELLED },
      { returnDocument: 'after' },
    );
    if (!updated) throw new NotFoundException('Booking not found');
    return { message: 'Booking cancelled' };
  }

  async removeFromCustomerHistory(id: string, customerId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid booking id');
    }
    const result = await this.bookingsModel.updateOne(
      {
        _id: id,
        customerId,
        status: {
          $in: [
            reviewsEnums.CANCELLED,
            reviewsEnums.REJECTED,
            reviewsEnums.COMPLETED,
          ],
        },
        hiddenForCustomer: { $ne: true },
      },
      { $set: { hiddenForCustomer: true } },
    );
    if (result.modifiedCount === 0) {
      throw new NotFoundException('Booking was not found in your history');
    }
    return { message: 'Booking removed from your history' };
  }

  private async assertCanAccessBooking(
    b: bookingsDocument,
    userId?: string,
    userRole?: string,
  ) {
    const customerId = b.customerId?.toString();
    let ownerId: string | undefined;
    if (b.restaurantId && typeof b.restaurantId === 'object') {
      ownerId = (
        b.restaurantId as { ownerId?: Types.ObjectId }
      ).ownerId?.toString();
    } else if (b.restaurantId) {
      const r = await this.restaurantModel.findById(b.restaurantId);
      ownerId = r?.ownerId?.toString();
    }
    const grantedRoles = new Set((userRole || '').split(','));
    if (grantedRoles.has(roles.ADMIN)) return;
    if (grantedRoles.has(roles.OWNER) && ownerId === userId) return;
    if (grantedRoles.has(roles.CUSTOMER) && customerId === userId) return;
    throw new UnauthorizedException(
      'You are not authorized to access this booking',
    );
  }

  private async assertCanAccessBookingId(
    b: bookingsDocument,
    userId?: string,
    userRole?: string,
  ) {
    const customerId = b.customerId?.toString();
    const restaurant = b.restaurantId
      ? await this.restaurantModel.findById(b.restaurantId)
      : null;
    const ownerId = restaurant?.ownerId?.toString();
    const grantedRoles = new Set((userRole || '').split(','));
    if (grantedRoles.has(roles.ADMIN)) return;
    if (grantedRoles.has(roles.OWNER) && ownerId === userId) return;
    if (grantedRoles.has(roles.CUSTOMER) && customerId === userId) return;
    throw new UnauthorizedException(
      'You are not authorized to modify this booking',
    );
  }

  private async formatBooking(b: bookingsDocument) {
    const obj = b.toObject();
    let restaurantName = 'Restaurant';
    let address = '';

    if (obj.restaurantId && typeof obj.restaurantId === 'object') {
      const r = obj.restaurantId as {
        name?: string;
        location?: { address?: string; city?: string };
      };
      restaurantName = r.name || restaurantName;
      address = r.location ? `${r.location.address}, ${r.location.city}` : '';
    } else if (obj.restaurantId) {
      const r = await this.restaurantModel.findById(obj.restaurantId);
      if (r) {
        restaurantName = r.name;
        address = `${r.location.address}, ${r.location.city}`;
      }
    }

    let customerName = 'Guest';
    if (obj.customerId && typeof obj.customerId === 'object') {
      customerName = (obj.customerId as { name?: string }).name || customerName;
    }

    const statusMap: Record<string, string> = {
      pending: 'pending',
      confirmed: 'confirmed',
      cancelled: 'rejected',
      rejected: 'rejected',
      completed: 'confirmed',
    };

    return {
      id: obj._id.toString(),
      restaurant: restaurantName,
      restaurantId:
        typeof obj.restaurantId === 'object'
          ? (obj.restaurantId as { _id: Types.ObjectId })._id?.toString()
          : obj.restaurantId?.toString(),
      name: customerName,
      date: new Date(obj.bookingDate).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      bookingDate: obj.bookingDate,
      time: obj.bookingTime,
      guests: obj.guests,
      address,
      status: statusMap[obj.status] || obj.status,
      backendStatus: obj.status,
      reason: obj.rejectionReason,
      note: obj.ownerNote,
      specialRequest: obj.specialRequest,
    };
  }
}
