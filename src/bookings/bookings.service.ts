import { Injectable } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { Model } from 'mongoose';
import { bookings, bookingsDocument } from './schema/bookings.schema';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(bookings.name)
    private readonly bookingsModel: Model<bookingsDocument>,
  ) {}

  create(createBookingDto: CreateBookingDto) {
    return 'This action adds a new booking';
  }

  findAll() {
    return `This action returns all bookings`;
  }

  findOne(id: number) {
    return `This action returns a #${id} booking`;
  }

  update(id: number, updateBookingDto: UpdateBookingDto) {
    return `This action updates a #${id} booking`;
  }

  remove(id: number) {
    return `This action removes a #${id} booking`;
  }
}
