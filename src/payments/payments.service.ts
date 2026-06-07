import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InjectModel } from '@nestjs/mongoose';
import { payment, paymentDocument, Payments } from './schema/payments.schema';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(payment.name) private paymentModel: Model<paymentDocument>,
  ) {}

  async create(dto: CreatePaymentDto) {
    const created = await this.paymentModel.create({
      ...dto,
      status: Payments.PAID,
      transactionId: dto.transactionId || randomUUID(),
    });
    return this.format(created);
  }

  async findAll(orderId?: string) {
    const filter = orderId ? { orderId } : {};
    const items = await this.paymentModel.find(filter).sort({ createdAt: -1 });
    return items.map((p) => this.format(p));
  }

  async findOne(id: string) {
    const item = await this.paymentModel.findById(id);
    if (!item) throw new NotFoundException('Payment not found');
    return this.format(item);
  }

  private format(p: paymentDocument) {
    const obj = p.toObject();
    return {
      id: obj._id.toString(),
      orderId: obj.orderId?.toString(),
      bookingId: obj.bookingId,
      amount: obj.amount,
      status: obj.status,
      transactionId: obj.transactionId,
      createdAt: obj.createdAt,
    };
  }
}
