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
import { restaurant, restaurantDocument } from 'src/restaurants/schema/restaurant.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Payments, payment, paymentDocument } from 'src/payments/schema/payments.schema';
import { randomUUID } from 'crypto';
import { roles } from 'src/users/schema/user.schema';
import { PromosService } from 'src/promos/promos.service';
import { PromoDiscountType } from 'src/promos/schema/promo.schema';
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
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.REJECTED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.ON_WAY, OrderStatus.CANCELLED],
  [OrderStatus.ON_WAY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [],
};

const CUSTOMER_ALLOWED = new Set([OrderStatus.CANCELLED]);
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
    @InjectModel(restaurant.name) private restaurantModel: Model<restaurantDocument>,
    @InjectModel(payment.name) private paymentModel: Model<paymentDocument>,
    private notificationsService: NotificationsService,
    private promosService: PromosService,
    private readonly orderEvents: OrderEventsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(
    dto: CreateOrderDto,
    userId?: string,
    userRole?: string,
  ) {
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

    const orderItems: { menuItemId: Types.ObjectId; name: string; qty: number; price: number }[] = [];
    let subtotal = 0;

    for (const item of dto.items) {
      if (!item.menuItemId || !Types.ObjectId.isValid(item.menuItemId)) {
        throw new BadRequestException(`Invalid menu item id: ${item.menuItemId}`);
      }
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        throw new BadRequestException('Item quantity must be between 1 and 100');
      }
      const menuItem = await this.menuModel.findById(item.menuItemId);
      if (!menuItem) throw new NotFoundException(`Menu item ${item.menuItemId} not found`);
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
        qty,
        price: Number(menuItem.price),
      });
      subtotal += Number(menuItem.price) * qty;
    }

    let discount = 0;
    let appliedPromoId: Types.ObjectId | null = null;
    let appliedDiscountType: PromoDiscountType | null = null;
    if (dto.promoCode) {
      const promoResult = await this.promosService.validateCode(dto.promoCode, subtotal);
      if (promoResult.valid) {
        // Consume the promo atomically BEFORE creating the order — if the code
        // just hit its usage limit, we refuse the discount instead of granting
        // one and silently swallowing the increment failure afterwards.
        const promoId = (promoResult as any).promoId
          ? new Types.ObjectId((promoResult as any).promoId)
          : null;
        if (promoId) {
          const consumed = await this.promosService.incrementUsageSafe(promoId);
          if (!consumed) {
            throw new BadRequestException('Promo code has just reached its usage limit');
          }
          appliedPromoId = promoId;
        }
        discount = promoResult.discount;
        appliedDiscountType = (promoResult as any).discountType ?? null;
      }
    }

    const deliveryFee = 3.99;
    const total = Math.max(0, Math.round((subtotal + deliveryFee - discount) * 100) / 100);

    const nowIso = new Date().toISOString();
    const placedAt = new Date(nowIso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    const timeline = DEFAULT_TIMELINE.map((step, i) => ({
      ...step,
      time: i === 0 ? placedAt : undefined,
      done: i === 0,
    }));
    void nowIso;

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

    // NOTE: promo usage was already incremented atomically BEFORE order
    // creation (validate → consume → create). No post-hoc increment here.

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
      if (customerId) filter.customerId = customerId;
      if (restaurantId) filter.restaurantId = restaurantId;
    } else if (userRole === roles.OWNER) {
      const owned = await this.restaurantModel.find({ ownerId: userId }).select('_id');
      const ownedIds = owned.map((r) => r._id);
      if (restaurantId) {
        if (!ownedIds.some((id) => id.toString() === restaurantId)) {
          throw new UnauthorizedException('You are not authorized to view these orders');
        }
        filter.restaurantId = restaurantId;
      } else {
        filter.restaurantId = { $in: ownedIds };
      }
      if (customerId) filter.customerId = customerId;
    } else {
      filter.customerId = userId;
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

    const ownerId =
      typeof found.restaurantId === 'object'
        ? (found.restaurantId as { ownerId?: Types.ObjectId }).ownerId?.toString()
        : undefined;
    const customerId =
      typeof found.customerId === 'object'
        ? (found.customerId as { _id?: Types.ObjectId })._id?.toString()
        : String(found.customerId);

    if (userRole === roles.OWNER && (!userId || ownerId !== userId)) {
      throw new UnauthorizedException('You are not authorized to view this order');
    } else if (userRole === roles.CUSTOMER && (!userId || customerId !== userId)) {
      throw new UnauthorizedException('You are not authorized to view this order');
    } else if (userRole !== roles.ADMIN && userRole !== roles.OWNER && userRole !== roles.CUSTOMER) {
      throw new UnauthorizedException('You are not authorized to view this order');
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
      .populate('customerId', 'name')
      .exec();

    if (!populated) throw new NotFoundException('Order not found');

    const ownerId =
      typeof populated.restaurantId === 'object'
        ? (populated.restaurantId as { ownerId?: Types.ObjectId }).ownerId?.toString()
        : undefined;

    if (userRole !== roles.ADMIN) {
      if (userRole === roles.CUSTOMER) {
        const customerId =
          typeof populated.customerId === 'object'
            ? (populated.customerId as { _id?: Types.ObjectId })._id?.toString()
            : String(populated.customerId);
        const allowedSelfCancel =
          status === OrderStatus.CANCELLED &&
          (populated.status === OrderStatus.PENDING ||
            populated.status === OrderStatus.ACCEPTED);
        if (!allowedSelfCancel || customerId !== userId) {
          throw new UnauthorizedException(
            'You are not authorized to update this order',
          );
        }
      } else if (userRole === roles.OWNER) {
        if (!userId || ownerId !== userId) {
          throw new UnauthorizedException(
            'You are not authorized to update this order',
          );
        }
        if (!OWNER_ALLOWED.has(status)) {
          throw new BadRequestException(
            `Restaurants cannot set order status to "${status}"`,
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

    const timeline = this.buildTimelineForStatus(status);
    // Optimistic concurrency: the update only matches if the status is still
    // what we validated above — two concurrent transitions can't both win.
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: id, status: populated.status },
        { status, timeline, eta: this.getEta(status) },
        { new: true },
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

    // Any state past PENDING means payment already succeeded (fake or Stripe),
    // so cancelling it must return the money. A refund failure must not block
    // the cancellation — the record stays for manual reconciliation.
    let refundWarning: string | undefined;
    if (status === OrderStatus.CANCELLED && populated.status !== OrderStatus.PENDING) {
      const refund = await this.paymentsService.refundOrderPayment(id);
      if (!refund.refunded && refund.reason) {
        refundWarning = `Order cancelled but refund could not be completed automatically: ${refund.reason}`;
        this.logger.warn(refundWarning);
      }
    }

    await this.notificationsService.create({
      userId: customerId,
      title: 'Order Update',
      message: `Your order is now: ${STATUS_LABELS[status] || status}`,
    });

    // Live push to any open SSE tracking streams for this order
    this.orderEvents.emit(id, status, updated.eta);

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
      promoCode: original.promoCode,
    });
  }

  private buildTimelineForStatus(status: OrderStatus) {
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
        ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
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
      // No fake rider names — rider assignment is a real feature, not a mock
      rider: obj.rider || null,
      timeline: obj.timeline,
      createdAt: obj.createdAt,
    };
  }
}
