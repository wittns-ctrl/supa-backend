import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { order, orderDocument, OrderStatus } from './schema/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { menu, menuDocument } from 'src/menus/schema/menu.schema';
import { restaurant, restaurantDocument } from 'src/restaurants/schema/restaurant.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Payments, payment, paymentDocument } from 'src/payments/schema/payments.schema';
import { randomUUID } from 'crypto';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Order Placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  'on-way': 'On the Way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

const DEFAULT_TIMELINE = [
  { key: 'placed', label: 'Order Placed', done: true },
  { key: 'confirmed', label: 'Confirmed', done: false },
  { key: 'preparing', label: 'Preparing', done: false },
  { key: 'on-way', label: 'Out for Delivery', done: false },
  { key: 'delivered', label: 'Delivered', done: false },
];

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(order.name) private orderModel: Model<orderDocument>,
    @InjectModel(menu.name) private menuModel: Model<menuDocument>,
    @InjectModel(restaurant.name) private restaurantModel: Model<restaurantDocument>,
    @InjectModel(payment.name) private paymentModel: Model<paymentDocument>,
    private notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('Order must have at least one item');
    }

    const orderItems: { menuItemId: Types.ObjectId; name: string; qty: number; price: number }[] = [];
    let subtotal = 0;

    for (const item of dto.items) {
      const menuItem = await this.menuModel.findById(item.menuItemId);
      if (!menuItem) throw new NotFoundException(`Menu item ${item.menuItemId} not found`);
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`${menuItem.name} is not available`);
      }
      orderItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        qty: item.qty,
        price: Number(menuItem.price),
      });
      subtotal += Number(menuItem.price) * item.qty;
    }

    let discount = 0;
    if (dto.promoCode?.toUpperCase() === 'SUPA10') {
      discount = 5;
    }

    const deliveryFee = 3.99;
    const total = subtotal + deliveryFee - discount;

    const timeline = DEFAULT_TIMELINE.map((step, i) => ({
      ...step,
      time: i === 0 ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined,
      done: i === 0,
    }));

    const created = await this.orderModel.create({
      customerId: dto.customerId,
      restaurantId: dto.restaurantId,
      items: orderItems,
      deliveryAddress: dto.deliveryAddress,
      timeSlot: dto.timeSlot,
      promoCode: dto.promoCode,
      subtotal,
      deliveryFee,
      discount,
      total,
      status: OrderStatus.PENDING,
      eta: '25-35 min',
      timeline,
    });

    await this.paymentModel.create({
      orderId: created._id,
      amount: total,
      status: Payments.PENDING,
      transactionId: randomUUID(),
    });

    const restaurantDoc = await this.restaurantModel.findById(dto.restaurantId);
    if (restaurantDoc) {
      await this.notificationsService.create({
        userId: restaurantDoc.ownerId.toString(),
        title: 'New Order',
        message: `New order received - $${total.toFixed(2)}`,
      });
    }

    await this.notificationsService.create({
      userId: dto.customerId,
      title: 'Order Placed',
      message: `Your order #${created._id.toString().slice(-4)} has been placed`,
    });

    return this.formatOrder(created, restaurantDoc?.name);
  }

  async findAll(customerId?: string, restaurantId?: string) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (restaurantId) filter.restaurantId = restaurantId;

    const orders = await this.orderModel
      .find(filter)
      .populate('restaurantId', 'name')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 });

    return Promise.all(
      orders.map((o) => {
        const rName =
          typeof o.restaurantId === 'object'
            ? (o.restaurantId as { name?: string }).name
            : undefined;
        return this.formatOrder(o, rName);
      }),
    );
  }

  async findOne(id: string) {
    const found = await this.orderModel
      .findById(id)
      .populate('restaurantId', 'name')
      .populate('customerId', 'name email phone');
    if (!found) throw new NotFoundException('Order not found');
    const rName =
      typeof found.restaurantId === 'object'
        ? (found.restaurantId as { name?: string }).name
        : undefined;
    return this.formatOrder(found, rName);
  }

  async getTracking(id: string) {
    const orderDoc = await this.findOne(id);
    return {
      ...orderDoc,
      updates: [
        { time: 'Just now', message: `Status: ${orderDoc.statusLabel}` },
      ],
    };
  }

  async updateStatus(id: string, status: OrderStatus) {
    const timeline = this.buildTimelineForStatus(status);
    const updated = await this.orderModel
      .findByIdAndUpdate(id, { status, timeline, eta: this.getEta(status) }, { new: true })
      .populate('customerId', 'name');

    if (!updated) throw new NotFoundException('Order not found');

    const customerId =
      typeof updated.customerId === 'object'
        ? (updated.customerId as { _id: Types.ObjectId })._id.toString()
        : String(updated.customerId);

    await this.notificationsService.create({
      userId: customerId,
      title: 'Order Update',
      message: `Your order is now: ${STATUS_LABELS[status] || status}`,
    });

    return this.formatOrder(updated);
  }

  async reorder(id: string, customerId: string) {
    const original = await this.orderModel.findById(id);
    if (!original) throw new NotFoundException('Order not found');

    if (original.customerId.toString() !== customerId) {
      throw new UnauthorizedException('You are not authorized to reorder this');
    }

    return this.create({
      customerId,
      restaurantId: original.restaurantId.toString(),
      items: original.items.map((i) => ({
        menuItemId: i.menuItemId.toString(),
        qty: i.qty,
      })),
      deliveryAddress: original.deliveryAddress,
      timeSlot: original.timeSlot,
      promoCode: original.promoCode,
    });
  }

  private buildTimelineForStatus(status: OrderStatus) {
    const statusOrder = ['placed', 'confirmed', 'preparing', 'on-way', 'delivered'];
    const statusToStep: Record<string, number> = {
      pending: 0,
      accepted: 1,
      preparing: 2,
      ready: 2,
      'on-way': 3,
      delivered: 4,
      cancelled: 0,
      rejected: 0,
    };
    const activeIndex = statusToStep[status] ?? 0;
    return DEFAULT_TIMELINE.map((step, i) => ({
      ...step,
      done: i <= activeIndex,
      time: i <= activeIndex
        ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : undefined,
    }));
  }

  private getEta(status: OrderStatus) {
    const map: Record<string, string> = {
      pending: '30-40 min',
      accepted: '25-35 min',
      preparing: '20-30 min',
      ready: '15-20 min',
      'on-way': '10-15 min',
      delivered: 'Delivered',
    };
    return map[status] || '25-35 min';
  }

  private formatOrder(o: orderDocument, restaurantName?: string) {
    const obj = o.toObject();
    const rName =
      restaurantName ||
      (typeof obj.restaurantId === 'object'
        ? (obj.restaurantId as { name?: string }).name
        : 'Restaurant');

    let customerName = 'Customer';
    if (obj.customerId && typeof obj.customerId === 'object') {
      customerName = (obj.customerId as { name?: string }).name || customerName;
    }

    return {
      id: obj._id.toString(),
      orderId: obj._id.toString().slice(-4).toUpperCase(),
      customerId: typeof obj.customerId === 'object'
        ? (obj.customerId as { _id: Types.ObjectId })._id?.toString()
        : obj.customerId?.toString(),
      restaurantId: typeof obj.restaurantId === 'object'
        ? (obj.restaurantId as { _id: Types.ObjectId })._id?.toString()
        : obj.restaurantId?.toString(),
      restaurant: rName,
      customer: customerName,
      items: obj.items.map((i) => ({
        name: i.name,
        menuItemId: i.menuItemId.toString(),
        qty: i.qty,
        price: i.price,
      })),
      itemsSummary: obj.items.map((i) => `${i.qty}x ${i.name}`).join(', '),
      deliveryAddress: obj.deliveryAddress,
      timeSlot: obj.timeSlot,
      subtotal: obj.subtotal,
      deliveryFee: obj.deliveryFee,
      discount: obj.discount,
      total: obj.total,
      status: obj.status,
      statusLabel: STATUS_LABELS[obj.status] || obj.status,
      eta: obj.eta,
      rider: obj.rider || 'Alex (Driver)',
      timeline: obj.timeline,
      createdAt: obj.createdAt,
    };
  }
}
