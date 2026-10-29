import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { order, orderDocument, OrderStatus } from './schema/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { menu, menuDocument } from 'src/menus/schema/menu.schema';
import {
  restaurant,
  restaurantDocument,
  RestaurantStatus,
} from 'src/restaurants/schema/restaurant.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  Payments,
  payment,
  paymentDocument,
} from 'src/payments/schema/payments.schema';
import { roles, User, UserDocument } from 'src/users/schema/user.schema';
import { OrderEventsService } from './order-events.service';
import { PaymentsService } from 'src/payments/payments.service';

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

/**
 * Allowed order status transitions. This is the order state machine — it
 * prevents owners/customers from skipping or reversing states arbitrarily
 * (e.g. pending → delivered without any kitchen steps).
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.ACCEPTED,
    OrderStatus.REJECTED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ACCEPTED]: [
    OrderStatus.PREPARING,
    OrderStatus.CANCELLED,
    OrderStatus.REJECTED,
  ],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.ON_WAY, OrderStatus.CANCELLED],
  [OrderStatus.ON_WAY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [],
};

const OWNER_ALLOWED = new Set([
  OrderStatus.ACCEPTED,
  OrderStatus.REJECTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.ON_WAY,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
]);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(order.name) private orderModel: Model<orderDocument>,
    @InjectModel(menu.name) private menuModel: Model<menuDocument>,
    @InjectModel(restaurant.name)
    private restaurantModel: Model<restaurantDocument>,
    @InjectModel(payment.name) private paymentModel: Model<paymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsService: NotificationsService,
    private readonly orderEvents: OrderEventsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(dto: CreateOrderDto, userId?: string, userRole?: string) {
    if (userRole === roles.CUSTOMER && userId) {
      dto.customerId = userId;
    }
    if (!dto.items?.length) {
      throw new BadRequestException('Order must have at least one item');
    }
    if (!dto.restaurantId || !Types.ObjectId.isValid(dto.restaurantId)) {
      throw new BadRequestException('Invalid restaurant id');
    }
    if (!dto.customerId || !Types.ObjectId.isValid(dto.customerId)) {
      throw new BadRequestException('Invalid customer id');
    }

    const address = dto.deliveryAddress;
    if (!address) throw new BadRequestException('Delivery address is required');
    const trimmedAddress = {
      street: String(address.street || '').trim(),
      apartment: String(address.apartment || '').trim(),
      city: String(address.city || '').trim(),
      postalCode: String(address.postalCode || '').trim(),
      phone: String(address.phone || '').trim(),
      instructions: String(address.instructions || '').trim(),
    };
    const phoneDigits = trimmedAddress.phone.replace(/\D/g, '');
    if (
      trimmedAddress.street.length < 2 ||
      trimmedAddress.street.length > 200 ||
      !/^[\p{L}\p{N}][\p{L}\p{N}\s,.'#+/-]{1,199}$/u.test(
        trimmedAddress.street,
      ) ||
      trimmedAddress.city.length < 2 ||
      trimmedAddress.city.length > 100 ||
      !/^[\p{L}\p{N}][\p{L}\p{N}\s.'-]{1,99}$/u.test(trimmedAddress.city) ||
      trimmedAddress.postalCode.length < 2 ||
      trimmedAddress.postalCode.length > 20 ||
      !/^[A-Za-z0-9][A-Za-z0-9 -]{1,19}$/.test(trimmedAddress.postalCode) ||
      !/^\+?[0-9][0-9\s().-]{6,18}$/.test(trimmedAddress.phone) ||
      phoneDigits.length < 8 ||
      phoneDigits.length > 15 ||
      trimmedAddress.apartment.length > 50 ||
      trimmedAddress.instructions.length > 300
    ) {
      throw new BadRequestException(
        'Please provide a valid delivery address and phone number',
      );
    }
    const allowedTimeSlots = [
      'ASAP (25-35 min)',
      '12:00 PM',
      '12:30 PM',
      '1:00 PM',
      '7:00 PM',
      '7:30 PM',
      '8:00 PM',
    ];
    if (!dto.timeSlot || !allowedTimeSlots.includes(dto.timeSlot)) {
      throw new BadRequestException('Please choose a valid delivery time');
    }

    const validItems = dto.items.map((item) => {
      if (!item.menuItemId || !Types.ObjectId.isValid(item.menuItemId)) {
        throw new BadRequestException(
          `Invalid menu item id: ${item.menuItemId}`,
        );
      }
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        throw new BadRequestException(
          'Item quantity must be between 1 and 100',
        );
      }
      return { id: new Types.ObjectId(item.menuItemId), qty };
    });
    // Fetch the restaurant, customer and every cart item concurrently — one
    // round trip each instead of a serial chain (and no per-item queries).
    const [restaurantDoc, customerDoc, menuItems] = await Promise.all([
      this.restaurantModel.findById(dto.restaurantId).exec(),
      this.userModel.findById(dto.customerId).select('name email phone').exec(),
      this.menuModel
        .find({ _id: { $in: validItems.map(({ id }) => id) } })
        .exec(),
    ]);
    // Orders can only be placed with a live, approved restaurant; otherwise
    // the order would be created with nobody to receive or notify.
    if (
      !restaurantDoc ||
      restaurantDoc.status !== RestaurantStatus.ACTIVE ||
      !restaurantDoc.isApproved
    ) {
      throw new BadRequestException(
        'This restaurant is not currently accepting orders',
      );
    }
    const menuById = new Map(
      menuItems.map((menuItem) => [menuItem._id.toString(), menuItem]),
    );
    const orderItems: {
      menuItemId: Types.ObjectId;
      name: string;
      qty: number;
      price: number;
    }[] = [];
    let subtotal = 0;

    for (const item of validItems) {
      const menuItem = menuById.get(item.id.toString());
      if (!menuItem)
        throw new NotFoundException(
          `Menu item ${item.id.toString()} not found`,
        );
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`${menuItem.name} is not available`);
      }
      // Guard against cross-restaurant carts: every item must belong to the
      // restaurant the order is being placed with.
      if (menuItem.restaurant?.toString() !== dto.restaurantId) {
        throw new BadRequestException(
          `${menuItem.name} does not belong to the selected restaurant`,
        );
      }
      orderItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        qty: item.qty,
        price: Number(menuItem.price),
      });
      subtotal += Number(menuItem.price) * item.qty;
    }
    // Avoid float drift (e.g. 0.1 * 3) leaking into stored/charged amounts.
    subtotal = Math.round(subtotal * 100) / 100;

    const discount = 0;
    const deliveryFee = 3.99;
    const total = Math.max(
      0,
      Math.round((subtotal + deliveryFee - discount) * 100) / 100,
    );

    const placedAt = new Date().toISOString();
    const timeline = DEFAULT_TIMELINE.map((step, i) => ({
      ...step,
      time: i === 0 ? placedAt : undefined,
      done: i === 0,
    }));
    const created = await this.orderModel.create({
      customerId: dto.customerId,
      restaurantId: dto.restaurantId,
      items: orderItems,
      deliveryAddress: trimmedAddress,
      timeSlot: dto.timeSlot,
      subtotal,
      deliveryFee,
      discount,
      total,
      status: OrderStatus.PENDING,
      eta: '25-35 min',
      timeline,
    });

    const createdAt = new Date();
    const orderTrace = {
      eventType: 'order.created',
      occurredAt: createdAt.toISOString(),
      orderId: created._id.toString(),
      orderStatus: created.status,
      paymentStatus: Payments.PENDING,
      customer: {
        id: dto.customerId,
        name: customerDoc?.name,
        email: customerDoc?.email,
        phone: customerDoc?.phone,
      },
      restaurant: {
        id: dto.restaurantId,
        name: restaurantDoc?.name,
      },
      items: created.items.map((item) => ({
        name: item.name,
        quantity: item.qty,
        unitPrice: item.price,
      })),
      amounts: { subtotal, deliveryFee, discount, total, currency: 'USD' },
      delivery: {
        address: trimmedAddress,
        requestedTime: created.timeSlot,
      },
    };
    // The order is already saved; a notification hiccup must not fail the
    // request (the customer would retry and double-order).
    const notified = await Promise.allSettled([
      this.notificationsService.create({
        userId: restaurantDoc.ownerId.toString(),
        title: 'New Order',
        message: `New order received - $${total.toFixed(2)}`,
        details: orderTrace,
      }),
      this.notificationsService.create({
        userId: dto.customerId,
        title: 'Order Placed',
        message: `Your order #${created._id.toString().slice(-4)} has been placed`,
        details: orderTrace,
      }),
    ]);
    for (const outcome of notified) {
      if (outcome.status === 'rejected') {
        this.logger.warn(
          `Order ${created._id.toString()} notification failed: ${String(outcome.reason)}`,
        );
      }
    }

    return this.formatOrder(created, restaurantDoc.name);
  }

  async findAll(
    customerId?: string,
    restaurantId?: string,
    userId?: string,
    userRole?: string,
    page = 1,
    limit = 20,
  ) {
    // Server-side scoping: customers can only ever see their own orders and
    // owners only their restaurants' orders, enforced in the DB query itself.
    const filter: Record<string, unknown> = {};

    if (userRole === roles.ADMIN) {
      if (customerId && !Types.ObjectId.isValid(customerId))
        throw new BadRequestException('Invalid customer id');
      if (restaurantId && !Types.ObjectId.isValid(restaurantId))
        throw new BadRequestException('Invalid restaurant id');
      if (customerId) filter.customerId = customerId;
      if (restaurantId) filter.restaurantId = restaurantId;
    } else if (userRole === roles.OWNER) {
      const owned = await this.restaurantModel
        .find({ ownerId: userId })
        .select('_id')
        .lean();
      const ownedIds = owned.map((r) => r._id);
      if (restaurantId) {
        if (!ownedIds.some((id) => id.toString() === restaurantId)) {
          throw new UnauthorizedException(
            'You are not authorized to view these orders',
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

    const [orders, totalCount] = await Promise.all([
      this.orderModel
        .find(filter)
        .populate('restaurantId', 'name ownerId')
        .populate('customerId', 'name email')
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      this.orderModel.countDocuments(filter),
    ]);

    const formatted = await Promise.all(
      orders.map((o) => {
        const rName =
          typeof o.restaurantId === 'object'
            ? (o.restaurantId as { name?: string }).name
            : undefined;
        return this.formatOrder(o, rName);
      }),
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
      throw new BadRequestException('Invalid order id');
    }
    const found = await this.orderModel
      .findById(id)
      .populate('restaurantId', 'name ownerId')
      .populate('customerId', 'name email phone');
    if (!found) throw new NotFoundException('Order not found');
    const grantedRoles = new Set((userRole || '').split(','));

    const ownerId =
      typeof found.restaurantId === 'object'
        ? (
            found.restaurantId as { ownerId?: Types.ObjectId }
          ).ownerId?.toString()
        : undefined;
    const customerId =
      typeof found.customerId === 'object'
        ? (found.customerId as { _id?: Types.ObjectId })._id?.toString()
        : String(found.customerId);

    const isOwner =
      grantedRoles.has(roles.OWNER) && !!userId && ownerId === userId;
    const isCustomer =
      grantedRoles.has(roles.CUSTOMER) && !!userId && customerId === userId;
    if (isCustomer && !isOwner && found.hiddenForCustomer) {
      throw new NotFoundException('Order not found');
    }
    if (grantedRoles.has(roles.ADMIN)) {
      // Admin access is handled separately from either account membership.
    } else if (!isOwner && !isCustomer) {
      throw new UnauthorizedException(
        'You are not authorized to view this order',
      );
    }

    const rName =
      typeof found.restaurantId === 'object'
        ? (found.restaurantId as { name?: string }).name
        : undefined;
    return this.formatOrder(found, rName);
  }

  async getTracking(id: string, userId?: string, userRole?: string) {
    const orderDoc = await this.findOne(id, userId, userRole);
    return {
      ...orderDoc,
      updates: [
        { time: 'Just now', message: `Status: ${orderDoc.statusLabel}` },
      ],
    };
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    userId?: string,
    userRole?: string,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order id');
    }
    if (!status || !Object.values(OrderStatus).includes(status)) {
      throw new BadRequestException('Invalid status value');
    }

    const populated = await this.orderModel
      .findById(id)
      .populate('restaurantId', 'name ownerId')
      .populate('customerId', 'name email phone')
      .exec();

    if (!populated) throw new NotFoundException('Order not found');

    const ownerId =
      typeof populated.restaurantId === 'object'
        ? (
            populated.restaurantId as { ownerId?: Types.ObjectId }
          ).ownerId?.toString()
        : undefined;

    const grantedRoles = new Set((userRole || '').split(','));
    if (!grantedRoles.has(roles.ADMIN)) {
      const customerId =
        typeof populated.customerId === 'object'
          ? (populated.customerId as { _id?: Types.ObjectId })._id?.toString()
          : String(populated.customerId);
      const isOwner =
        grantedRoles.has(roles.OWNER) && !!userId && ownerId === userId;
      const isCustomer =
        grantedRoles.has(roles.CUSTOMER) && !!userId && customerId === userId;
      if (isOwner) {
        if (!OWNER_ALLOWED.has(status)) {
          throw new BadRequestException(
            `Restaurants cannot set order status to "${status}"`,
          );
        }
      } else if (isCustomer) {
        const allowedSelfCancel =
          status === OrderStatus.CANCELLED &&
          (populated.status === OrderStatus.PENDING ||
            populated.status === OrderStatus.ACCEPTED);
        if (!allowedSelfCancel || customerId !== userId) {
          throw new UnauthorizedException(
            'You are not authorized to update this order',
          );
        }
      } else {
        throw new UnauthorizedException(
          'You are not authorized to update this order',
        );
      }
    }

    // State machine: reject illegal transitions regardless of role
    const allowedFrom = ALLOWED_TRANSITIONS[populated.status] || [];
    if (populated.status !== status && !allowedFrom.includes(status)) {
      throw new BadRequestException(
        `Cannot change order status from "${populated.status}" to "${status}"`,
      );
    }

    const timeline = this.buildTimelineForStatus(status, populated.timeline);
    // Optimistic concurrency: the update only matches if the status is still
    // what we validated above — two concurrent transitions can't both win.
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: id, status: populated.status },
        { status, timeline, eta: this.getEta(status) },
        { returnDocument: 'after' },
      )
      .populate('customerId', 'name');

    if (!updated) {
      throw new ConflictException(
        `Order status changed concurrently — refresh and try again (current status: "${populated.status}")`,
      );
    }

    const customerId =
      typeof updated.customerId === 'object'
        ? (updated.customerId as { _id: Types.ObjectId })._id.toString()
        : String(updated.customerId);

    // Cancelling or rejecting an order that was paid must return the money.
    // A refund failure must not block the state change; report it for review.
    let refundWarning: string | undefined;
    if (status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED) {
      const refund = await this.paymentsService.refundOrderPayment(id);
      if (
        !refund.refunded &&
        refund.reason &&
        refund.reason !== 'no paid payment found'
      ) {
        refundWarning = `Order ${status} but refund could not be completed automatically: ${refund.reason}`;
        this.logger.warn(refundWarning);
      }
    }

    const latestPayment = await this.paymentModel
      .findOne({ orderId: updated._id })
      .sort({ createdAt: -1 })
      .select('status method transactionId amount currency');

    await this.notificationsService.create({
      userId: customerId,
      title: 'Order Update',
      message: `Your order is now: ${STATUS_LABELS[status] || status}`,
      details: {
        eventType: 'order.status_changed',
        occurredAt: new Date().toISOString(),
        orderId: updated._id.toString(),
        previousStatus: populated.status,
        orderStatus: updated.status,
        actorUserId: userId,
        customer:
          typeof updated.customerId === 'object'
            ? {
                id: customerId,
                name: (updated.customerId as any).name,
                email: (updated.customerId as any).email,
                phone: (updated.customerId as any).phone,
              }
            : { id: customerId },
        restaurant:
          typeof populated.restaurantId === 'object'
            ? {
                id: (populated.restaurantId as any)._id.toString(),
                name: (populated.restaurantId as any).name,
              }
            : { id: String(populated.restaurantId) },
        amount: { total: updated.total, currency: 'USD' },
        payment: latestPayment
          ? {
              status: latestPayment.status,
              method: latestPayment.method,
              transactionId: latestPayment.transactionId,
              amount: latestPayment.amount,
              currency: latestPayment.currency,
            }
          : { status: 'not recorded' },
        items: updated.items.map((item) => ({
          name: item.name,
          quantity: item.qty,
          unitPrice: item.price,
        })),
        delivery: updated.deliveryAddress,
      },
    });

    // Live push to any open SSE tracking streams for this order
    await this.orderEvents.emit(id, status, updated.eta);

    const formatted = this.formatOrder(updated);
    return refundWarning ? { ...formatted, warning: refundWarning } : formatted;
  }

  async reorder(id: string, customerId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order id');
    }
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
    });
  }

  async hideFromCustomerHistory(id: string, customerId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order id');
    }
    const result = await this.orderModel.updateOne(
      {
        _id: id,
        customerId,
        status: {
          $in: [
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
            OrderStatus.REJECTED,
          ],
        },
        hiddenForCustomer: { $ne: true },
      },
      { $set: { hiddenForCustomer: true } },
    );
    if (result.modifiedCount === 0) {
      throw new NotFoundException('Order was not found in your history');
    }
    return { message: 'Order removed from your history' };
  }

  private buildTimelineForStatus(
    status: OrderStatus,
    existingTimeline: orderDocument['timeline'] = [],
  ) {
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
    const now = new Date().toISOString();
    return DEFAULT_TIMELINE.map((step, i) => ({
      ...step,
      done: i <= activeIndex,
      // Preserve the timestamp when a step first completed. Statuses such as
      // READY share the Preparing timeline step, so its original time remains.
      time:
        i <= activeIndex
          ? existingTimeline?.find((previous) => previous.key === step.key)
              ?.time || now
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
      customerId:
        typeof obj.customerId === 'object'
          ? (obj.customerId as { _id: Types.ObjectId })._id?.toString()
          : obj.customerId?.toString(),
      restaurantId:
        typeof obj.restaurantId === 'object'
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
      // No fake rider names — rider assignment is a real feature, not a mock
      rider: obj.rider || null,
      timeline: obj.timeline,
      createdAt: obj.createdAt,
    };
  }
}
