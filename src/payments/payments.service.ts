import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { payment, paymentDocument, Payments, PaymentMethod } from './schema/payments.schema';
import { order, orderDocument, OrderStatus } from '../orders/schema/order.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from 'src/mail/mail.service';
import { randomUUID } from 'crypto';
import { roles } from 'src/users/schema/user.schema';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe | null = null;

  constructor(
    @InjectModel(payment.name) private paymentModel: Model<paymentDocument>,
    @InjectModel(order.name) private orderModel: Model<orderDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly mailservice: MailService,
  ) {
    const sk = process.env.STRIPE_SECRET_KEY;
    if (sk && sk.startsWith('sk_')) {
      this.stripe = new Stripe(sk, {
        apiVersion: '2026-08-26.dahlia' as any,
        typescript: true,
      });
      this.logger.log('Stripe configured');
    } else {
      const env = (process.env.NODE_ENV || 'development').toLowerCase();
      const isProd = env === 'production' || env === 'prod';
      if (isProd) {
        throw new Error(
          'PAYMENTS_MISCONFIGURED: STRIPE_SECRET_KEY is required when NODE_ENV=production. Refusing to start in insecure fake-payments mode.',
        );
      }
      this.logger.warn(
        'STRIPE_SECRET_KEY not set — payments module will run in FAKE mode (auto mark as paid) for local dev only. ' +
          'This is ONLY allowed in NODE_ENV=development — production will refuse to boot.',
      );
    }
  }

  private get currency(): string {
    return process.env.STRIPE_CURRENCY || 'usd';
  }

  isStripeConfigured(): boolean {
    return !!this.stripe;
  }

  private assertValidOrderId(orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid order id');
    }
  }

  private async loadOrderForUser(orderId: string, userId: string, userRole: string) {
    this.assertValidOrderId(orderId);
    const order = await this.orderModel
      .findById(orderId)
      .populate('customerId', '_id')
      .exec();
    if (!order) throw new NotFoundException('Order not found');

    const populated = order.customerId as { _id?: Types.ObjectId } | Types.ObjectId | null | undefined;
    const customerId =
      populated && typeof populated === 'object' && '_id' in populated && populated._id
        ? populated._id.toString()
        : populated
          ? String(populated)
          : '';

    if (userRole !== roles.ADMIN && (!customerId || customerId !== userId)) {
      throw new UnauthorizedException('You are not authorized to pay for this order');
    }
    return order;
  }

  async createPaymentIntent(
    orderId: string,
    userId: string,
    userRole: string,
    metadata: Record<string, string> = {},
  ) {
    const order = await this.loadOrderForUser(orderId, userId, userRole);

    const amount = Number(order.total) || 0;
    if (amount <= 0) throw new BadRequestException('Invalid order total');

    // Refuse double-payment for an already-paid order
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order is not payable in its current status (${order.status})`,
      );
    }
    const existingPending = await this.paymentModel
      .findOne({ orderId: order._id, status: Payments.PENDING, method: PaymentMethod.STRIPE })
      .exec();
    if (existingPending?.paymentIntentId && this.stripe) {
      // Reuse the existing intent instead of creating duplicates
      const intent = await this.stripe.paymentIntents.retrieve(existingPending.paymentIntentId);
      if (intent.status !== 'succeeded' && intent.status !== 'canceled') {
        return {
          mode: 'stripe',
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          amount,
          currency: this.currency,
          orderId: order.id,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        };
      }
    }

    const amountCents = Math.round(amount * 100);
    const populatedCustomer = order.customerId as
      | { _id?: Types.ObjectId }
      | Types.ObjectId
      | null
      | undefined;
    const customer =
      populatedCustomer && typeof populatedCustomer === 'object' && '_id' in populatedCustomer && populatedCustomer._id
        ? populatedCustomer._id
        : (populatedCustomer as Types.ObjectId | undefined);
    if (!customer) throw new BadRequestException('Order has no customer');

    if (this.stripe) {
      const intent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: this.currency,
        // Client-supplied metadata spread FIRST so orderId/customerId can't be
        // overridden — these keys are server-trusted and used by the webhook.
        metadata: {
          ...metadata,
          orderId: order.id,
          customerId: customer.toString(),
        },
        automatic_payment_methods: { enabled: true },
      });

      await this.paymentModel.create({
        orderId: order._id,
        amount,
        status: Payments.PENDING,
        method: PaymentMethod.STRIPE,
        paymentIntentId: intent.id,
        transactionId: intent.id,
        currency: this.currency,
        metadata,
      });

      return {
        mode: 'stripe',
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount,
        currency: this.currency,
        orderId: order.id,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      };
    }

    // Fake mode — for local dev only
    const txId = randomUUID();
    await this.paymentModel.create({
      orderId: order._id,
      amount,
      status: Payments.PAID,
      method: PaymentMethod.CASH,
      // The client confirms with the returned paymentIntentId — without it
      // confirmPayment() can't find this record and 404s.
      paymentIntentId: txId,
      transactionId: txId,
      currency: this.currency,
      metadata: { ...metadata, fake: 'true' },
    });

    await this.notificationsService.create({
      userId: customer.toString(),
      title: 'Payment confirmed (dev mode)',
      message: `Your order ${order.id} has been paid ($${amount.toFixed(2)}) and is awaiting restaurant acceptance.`,
    });

    return {
      mode: 'fake',
      paymentIntentId: txId,
      amount,
      currency: this.currency,
      orderId: order.id,
      publishableKey: '',
      warning:
        'STRIPE_SECRET_KEY not configured — running in fake dev mode. No money moved.',
    };
  }

  async confirmPayment(paymentIntentId: string, userId?: string, userRole?: string) {
    const record = await this.paymentModel.findOne({ paymentIntentId }).exec();
    if (!record) {
      // In case of a direct confirm without create (e.g. Stripe client-first)
      if (!this.stripe) {
        throw new NotFoundException('Payment record not found');
      }
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      const orderId = intent.metadata?.orderId;
      if (!orderId) throw new BadRequestException('Payment does not have order metadata');
      if (userId && userRole !== roles.ADMIN) {
        await this.assertOrderOwnership(orderId, userId);
      }
      const res = await this._applyPaid(orderId, paymentIntentId, intent.amount_received / 100);
      return { success: true, ...res };
    }

    if (userId && userRole !== roles.ADMIN && record.orderId) {
      // Caller must own the order being paid (admins exempt)
      await this.assertOrderOwnership(record.orderId.toString(), userId);
    }

    if (this.stripe && record.method === PaymentMethod.STRIPE) {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status === 'requires_payment_method' || intent.status === 'requires_confirmation') {
        record.status = Payments.PENDING;
        await record.save();
        return { success: false, status: intent.status, clientSecret: intent.client_secret };
      }
      if (intent.status !== 'succeeded') {
        record.status = Payments.FAILED;
        await record.save();
        return { success: false, status: intent.status };
      }
    }

    const orderId = record.orderId?.toString();
    if (!orderId) throw new BadRequestException('Payment does not have an order');
    const applied = await this._applyPaid(orderId, paymentIntentId, Number(record.amount));
    return { success: true, paymentStatus: 'succeeded', ...applied };
  }

  private async assertOrderOwnership(orderId: string, userId: string) {
    this.assertValidOrderId(orderId);
    const order = await this.orderModel.findById(orderId).select('customerId').exec();
    if (!order) throw new NotFoundException('Order not found');
    const customerId = order.customerId?.toString();
    if (customerId !== userId) {
      throw new UnauthorizedException('You are not authorized to confirm this payment');
    }
  }

  private async _applyPaid(orderId: string, paymentIntentId: string, amount: number) {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    await this.paymentModel.updateOne(
      { paymentIntentId },
      { $set: { status: Payments.PAID, transactionId: paymentIntentId, amount } },
      { upsert: false },
    );

    // Idempotency + state guard: payment confirmation must not accept the
    // order. The restaurant owner performs that explicit transition.
    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.ACCEPTED
    ) {
      this.logger.warn(
        `Payment received for order ${order.id} in non-payable state "${order.status}" — order not modified`,
      );
      return {
        orderId: order.id,
        status: order.status,
        amount,
        warning: `Order was in status "${order.status}" — payment recorded but order state unchanged`,
      };
    }

    const customerId = order.customerId?.toString();
    if (customerId) {
      await this.notificationsService.create({
        userId: customerId,
        title: 'Payment confirmed',
        message: `Your order ${order.id} has been paid and is awaiting restaurant acceptance.`,
      });
    }

    return { orderId: order.id, status: order.status, amount };
  }

  /**
   * Refund the most recent successful payment for an order. Used when a paid
   * order is cancelled. Idempotent: skips orders whose latest payment is
   * already refunded, and skips gracefully when Stripe is not configured
   * (fake dev mode has no money to return).
   */
  async refundOrderPayment(orderId: string): Promise<{ refunded: boolean; reason?: string }> {
    this.assertValidOrderId(orderId);
    const record = await this.paymentModel
      .findOne({ orderId: new Types.ObjectId(orderId), status: Payments.PAID })
      .sort({ createdAt: -1 })
      .exec();
    if (!record) {
      return { refunded: false, reason: 'no paid payment found' };
    }
    if (!this.stripe || !record.paymentIntentId) {
      return { refunded: false, reason: 'stripe not configured or no payment intent' };
    }
    try {
      await this.stripe.refunds.create({ payment_intent: record.paymentIntentId });
    } catch (err) {
      // Already-refunded is the only expected conflict — treat as success
      const message = err instanceof Error ? err.message : String(err);
      if (!/already been refunded/i.test(message)) {
        this.logger.error(`Refund failed for order ${orderId}`, err as Error);
        return { refunded: false, reason: message };
      }
    }
    await this.paymentModel.updateOne(
      { _id: record._id },
      { $set: { status: Payments.REFUNDED } },
    );
    return { refunded: true };
  }

  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured');
    }
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new BadRequestException('Webhook secret not set');

    let event: Stripe.Event;
    try {
      // rawBody is now a real Buffer captured by express.raw() in main.ts
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err as Error);
      throw new BadRequestException('Invalid webhook signature');
    }

    // Webhooks are server-trusted (signature verified) — no user scoping here.
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.confirmPayment(pi.id);

      // Receipt email fires here (and only here) so each successful payment
      // produces exactly one receipt, even if the client also called confirm.
      try {
        const orderId = pi.metadata?.orderId;
        if (orderId) {
          const order = await this.orderModel
            .findById(orderId)
            .populate('customerId', 'email')
            .exec();
          const email =
            typeof order?.customerId === 'object'
              ? (order.customerId as { email?: string }).email
              : undefined;
          if (email) {
            await this.mailservice.sendPaymentReceipt({
              to: email,
              orderId,
              amount: pi.amount_received / 100,
              currency: pi.currency || this.currency,
              itemsSummary: order?.items
                ?.map((i) => `${i.name} ×${i.qty}`)
                .join(', '),
            });
          }
        }
      } catch (err) {
        // A receipt failure must never fail the webhook (Stripe would retry)
        this.logger.warn('Payment receipt email failed', err as Error);
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.paymentModel.updateOne(
        { paymentIntentId: pi.id },
        { $set: { status: Payments.FAILED } },
      );
    } else if (event.type === 'charge.refunded') {
      const ch = event.data.object as Stripe.Charge;
      if (ch.payment_intent && typeof ch.payment_intent === 'string') {
        await this.paymentModel.updateOne(
          { paymentIntentId: ch.payment_intent },
          { $set: { status: Payments.REFUNDED } },
        );
      }
    }
    return { received: true, type: event.type };
  }

  create(createPaymentDto: Partial<payment>) {
    if (!createPaymentDto.transactionId) createPaymentDto.transactionId = randomUUID();
    if (!createPaymentDto.status) createPaymentDto.status = Payments.PENDING;
    if (!createPaymentDto.method) createPaymentDto.method = PaymentMethod.STRIPE;
    return this.paymentModel.create(createPaymentDto);
  }

  findAll(userId?: string, userRole?: string) {
    if (userRole !== roles.ADMIN) {
      throw new UnauthorizedException('Admin role required to list payments');
    }
    return this.paymentModel.find().sort({ createdAt: -1 }).limit(100);
  }

  findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid payment id');
    }
    return this.paymentModel.findById(id);
  }

  async findByOrder(orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid order id');
    }
    return this.paymentModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .sort({ createdAt: -1 });
  }

  remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid payment id');
    }
    return this.paymentModel.findByIdAndDelete(id);
  }
}
