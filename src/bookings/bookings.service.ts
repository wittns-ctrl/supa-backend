import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { Model, Types } from 'mongoose';
import { bookings, bookingsDocument, reviewsEnums } from './schema/bookings.schema';
import { InjectModel } from '@nestjs/mongoose';
import { restaurant, restaurantDocument } from 'src/restaurants/schema/restaurant.schema';
import { User, UserDocument } from 'src/users/schema/user.schema';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(bookings.name)
    private readonly bookingsModel: Model<bookingsDocument>,
    @InjectModel(restaurant.name)
    private readonly restaurantModel: Model<restaurantDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createBookingDto: CreateBookingDto) {
    const created = await this.bookingsModel.create({
      ...createBookingDto,
      bookingDate: new Date(createBookingDto.bookingDate),
      specialRequest: createBookingDto.specialRequest || '',
      status: reviewsEnums.PENDING,
    });

    const restaurantDoc = await this.restaurantModel.findById(createBookingDto.restaurantId);
    if (restaurantDoc) {
      await this.notificationsService.create({
        userId: restaurantDoc.ownerId.toString(),
        title: 'New Table Booking',
        message: `New booking request for ${restaurantDoc.name}`,
      });
    }

    return this.formatBooking(created);
  }

  async findAll(customerId?: string, restaurantId?: string) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (restaurantId) filter.restaurantId = restaurantId;

    const items = await this.bookingsModel
      .find(filter)
      .populate('restaurantId', 'name location cuisine')
      .populate('customerId', 'name email phone')
      .sort({ createdAt: -1 });

    return Promise.all(items.map((b) => this.formatBooking(b)));
  }

  async findOne(id: string) {
    const booking = await this.bookingsModel
      .findById(id)
      .populate('restaurantId', 'name location cuisine')
      .populate('customerId', 'name email phone');
    if (!booking) throw new NotFoundException('Booking not found');
    return this.formatBooking(booking);
  }

  async update(id: string, updateBookingDto: UpdateBookingDto) {
    const updated = await this.bookingsModel
      .findByIdAndUpdate(id, updateBookingDto, { new: true })
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
  }

  async remove(id: string) {
    const updated = await this.bookingsModel.findByIdAndUpdate(
      id,
      { status: reviewsEnums.CANCELLED },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Booking not found');
    return { message: 'Booking cancelled' };
  }

  private async formatBooking(b: bookingsDocument) {
    const obj = b.toObject();
    let restaurantName = 'Restaurant';
    let address = '';

    if (obj.restaurantId && typeof obj.restaurantId === 'object') {
      const r = obj.restaurantId as { name?: string; location?: { address?: string; city?: string } };
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
      restaurantId: typeof obj.restaurantId === 'object'
        ? (obj.restaurantId as { _id: Types.ObjectId })._id?.toString()
        : obj.restaurantId?.toString(),
      name: customerName,
      date: new Date(obj.bookingDate).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
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
