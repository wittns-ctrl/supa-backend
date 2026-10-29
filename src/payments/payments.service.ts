import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  payment,
  paymentDocument,
  Payments,
  PaymentMethod,
} from './schema/payments.schema';
import {
  order,
  orderDocument,
  OrderStatus,
} from '../orders/schema/order.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from 'src/mail/mail.service';
import { randomUUID } from 'crypto';
import { roles } from 'src/users/schema/user.schema';

const PAYPAL_TIMEOUT_MS = 15_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly paypalClientId = process.env.PAYPAL_CLIENT_ID || '';
  private readonly paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET || '';

  constructor(
    @InjectModel(payment.name) private paymentModel: Model<paymentDocument>,
    @InjectModel(order.name) private orderModel: Model<orderDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly mailservice: MailService,
  ) {
    const env = (process.env.NODE_ENV || 'development').toLowerCase();
    const isProd = env === 'production' || env === 'prod';
    if (isProd && (!this.paypalClientId || !this.paypalClientSecret)) {
      throw new Error(
        'PAYMENTS_MISCONFIGURED: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required in production.',
      );
    }
    if (this.paypalClientId && this.paypalClientSecret) {
      this.logger.log(`PayPal configured (${this.paypalEnvironment})`);
    } else {
      this.logger.warn(
        'PayPal credentials are missing; checkout payments are disabled until PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are configured.',
      );
    }
  }

  private get currency(): string {
    return (process.env.PAYPAL_CURRENCY || 'USD').toUpperCase();
  }

  private get paypalEnvironment(): 'sandbox' | 'live' {
    return (process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
      ? 'live'
      : 'sandbox';
  }

  private get paypalApiBase(): string {
    return this.paypalEnvironment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private assertPaypalConfigured() {
    if (!this.paypalClientId || !this.paypalClientSecret) {
      throw new BadRequestException(
        'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server.',
      );
    }
  }

  getPaypalConfig() {
    this.assertPaypalConfigured();
    return { clientId: this.paypalClientId, currency: this.currency };
  }

  // PayPal access tokens live for ~9 hours. Fetching a fresh one per call
  // doubled the latency (and PayPal rate-limit usage) of every payment request.
  private cachedToken?: { value: string; expiresAt: number };
  private pendingToken?: Promise<string>;

  private async getPaypalToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.cachedToken &&
      this.cachedToken.expiresAt > Date.now() + 60_000
    ) {
      return this.cachedToken.value;
    }
    // Concurrent callers share one in-flight token request.
    if (!this.pendingToken) {
      this.pendingToken = (async () => {
        const credentials = Buffer.from(
          `${this.paypalClientId}:${this.paypalClientSecret}`,
        ).toString('base64');
        const tokenResponse = await fetch(
          `${this.paypalApiBase}/v1/oauth2/token`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
          },
        );
        if (!tokenResponse.ok) {
          this.logger.error(
            `PayPal OAuth failed with status ${tokenResponse.status}`,
          );
          throw new BadRequestException(
            'Could not authenticate with PayPal. Check the configured API credentials.',
          );
        }
        const token = (await tokenResponse.json()) as {
          access_token: string;
          expires_in?: number;
        };
        this.cachedToken = {
          value: token.access_token,
          expiresAt: Date.now() + (Number(token.expires_in) || 300) * 1000,
        };
        return token.access_token;
      })().finally(() => {
        this.pendingToken = undefined;
      });
    }
    return this.pendingToken;
  }

  private async paypalRequest(path: string, options: RequestInit = {}) {
    this.assertPaypalConfigured();
    const send = async (accessToken: string) =>
      fetch(`${this.paypalApiBase}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
      });
    let response: Response;
    try {
      response = await send(await this.getPaypalToken());
      if (response.status === 401) {
        // Token revoked/expired early — fetch a new one and retry once.
        response = await send(await this.getPaypalToken(true));
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `PayPal request ${path} failed: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'PayPal is not responding right now. Please try again.',
      );
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.error(
        `PayPal API ${path} failed with status ${response.status}`,
      );
      throw new BadRequestException(
        body?.message || 'PayPal could not process the payment request.',
      );
    }
    return body as Record<string, any>;
  }

  private assertValidOrderId(orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid order id');
    }
  }

  private async loadOrderForUser(
    orderId: string,
    userId: string,
    userRole: string,
  ) {
    this.assertValidOrderId(orderId);
    const order = await this.orderModel
      .findById(orderId)
      .populate('customerId', '_id')
      .exec();
    if (!order) throw new NotFoundException('Order not found');

    const populated = order.customerId as
      | { _id?: Types.ObjectId }
      | Types.ObjectId
      | null
      | undefined;
    const customerId =
      populated &&
      typeof populated === 'object' &&
      '_id' in populated &&
      populated._id
        ? populated._id.toString()
        : populated
          ? String(populated)
          : '';

    if (userRole !== roles.ADMIN && (!customerId || customerId !== userId)) {
      throw new UnauthorizedException(
        'You are not authorized to pay for this order',
      );
    }
    return order;
  }

  async createPaypalOrder(orderId: string, userId: string, userRole: string) {
    const order = await this.loadOrderForUser(orderId, userId, userRole);
    const amount = Number(order.total) || 0;
    if (amount <= 0) throw new BadRequestException('Invalid order total');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order is not payable in its current status (${order.status})`,
      );
    }

    const existingPending = await this.paymentModel
      .findOne({
        orderId: order._id,
        status: Payments.PENDING,
        method: PaymentMethod.PAYPAL,
      })
      .sort({ createdAt: -1 })
      .exec();
    if (existingPending?.paymentIntentId) {
      return {
        paypalOrderId: existingPending.paymentIntentId,
        clientId: this.paypalClientId,
        amount,
        currency: existingPending.currency || this.currency,
        localOrderId: order.id,
      };
    }

    const paypalOrder = await this.paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `supameal-${order.id}-${Date.now()}` },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: order.id,
            custom_id: order.id,
            amount: { currency_code: this.currency, value: amount.toFixed(2) },
          },
        ],
        application_context: {
          user_action: 'PAY_NOW',
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/dashboard?tab=checkout`,
          cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/dashboard?tab=checkout`,
        },
      }),
    });
    if (!paypalOrder.id)
      throw new BadRequestException(
        'PayPal did not return an order reference.',
      );

    await this.paymentModel.create({
      orderId: order._id,
      amount,
      status: Payments.PENDING,
      method: PaymentMethod.PAYPAL,
      paymentIntentId: paypalOrder.id,
      transactionId: paypalOrder.id,
      currency: this.currency,
    });
    return {
      paypalOrderId: paypalOrder.id,
      clientId: this.paypalClientId,
      amount,
      currency: this.currency,
      localOrderId: order.id,
    };
  }

  async capturePaypalOrder(
    paypalOrderId: string,
    userId: string,
    userRole: string,
  ) {
    const record = await this.paymentModel
      .findOne({
        paymentIntentId: paypalOrderId,
        method: PaymentMethod.PAYPAL,
      })
      .exec();
    if (!record?.orderId)
      throw new NotFoundException('PayPal payment record not found');
    const order = await this.loadOrderForUser(
      record.orderId.toString(),
      userId,
      userRole,
    );

    if (record.status === Payments.PAID) {
      return {
        success: true,
        paymentStatus: 'succeeded',
        orderId: order.id,
        status: order.status,
        amount: Number(record.amount),
      };
    }
    if (record.status !== Payments.PENDING)
      throw new BadRequestException('This PayPal payment is not pending.');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order is no longer payable (${order.status}); PayPal has not been captured.`,
      );
    }

    let captured: Record<string, any>;
    try {
      captured = await this.paypalRequest(
        `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
        {
          method: 'POST',
          headers: { 'PayPal-Request-Id': `capture-${paypalOrderId}` },
          body: '{}',
        },
      );
    } catch (captureError) {
      // Recover when PayPal captured successfully but the response was lost.
      // The stored PayPal order ID is server-created and already bound to this local order.
      captured = await this.paypalRequest(
        `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      );
      if (captured.status !== 'COMPLETED') throw captureError;
    }
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    const capturedAmount = Number(capture?.amount?.value);
    const capturedCurrency = String(
      capture?.amount?.currency_code || '',
    ).toUpperCase();
    if (captured.status !== 'COMPLETED' || !capture?.id) {
      throw new BadRequestException('PayPal has not completed this payment.');
    }
    if (
      capturedAmount !== Number(record.amount) ||
      capturedCurrency !==
        String(record.currency || this.currency).toUpperCase()
    ) {
      this.logger.error(`PayPal amount mismatch for order ${order.id}`);
      throw new BadRequestException(
        'PayPal captured an amount that does not match this order. Contact support before retrying.',
      );
    }

    // Atomically claim the PENDING -> PAID transition and store the capture id
    // in one write. Two concurrent capture requests (double-click, retry) both
    // reach this point, but only one may notify the customer and send a receipt.
    const claimed = await this.paymentModel
      .findOneAndUpdate(
        { _id: record._id, status: Payments.PENDING },
        {
          $set: {
            status: Payments.PAID,
            transactionId: capture.id,
            currency: capturedCurrency,
            amount: capturedAmount,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!claimed) {
      return {
        success: true,
        paymentStatus: 'succeeded',
        orderId: order.id,
        status: order.status,
        amount: capturedAmount,
      };
    }

    const applied = await this._applyPaid(
      order.id,
      paypalOrderId,
      capturedAmount,
      capture.id,
    );
    await this.sendPaymentReceipt(order.id, capturedAmount, capturedCurrency);
    return {
      success: true,
      paymentStatus: 'succeeded',
      captureId: capture.id,
      ...applied,
    };
  }
  private async _applyPaid(
    orderId: string,
    paymentIntentId: string,
    amount: number,
    transactionId = paymentIntentId,
  ) {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    // The payment row was already marked PAID (with the capture id) by the
    // atomic claim in capturePaypalOrder; this only reports the outcome.

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
        details: {
          eventType: 'payment.confirmed',
          occurredAt: new Date().toISOString(),
          orderId: order._id.toString(),
          orderStatus: order.status,
          paymentStatus: Payments.PAID,
          paymentIntentId,
          transactionId,
          amount: { value: amount, currency: this.currency.toUpperCase() },
          customerId,
          restaurantId: order.restaurantId.toString(),
        },
      });
    }

    return { orderId: order.id, status: order.status, amount };
  }

  /**
   * Refund the most recent successful payment for an order. Used when a paid
   * order is cancelled. Idempotent: skips orders whose latest payment is
   * already refunded and reports provider failures to the caller.
   */
  async refundOrderPayment(
    orderId: string,
  ): Promise<{ refunded: boolean; reason?: string }> {
    this.assertValidOrderId(orderId);
    const record = await this.paymentModel
      .findOne({ orderId: new Types.ObjectId(orderId), status: Payments.PAID })
      .sort({ createdAt: -1 })
      .exec();
    if (!record) return { refunded: false, reason: 'no paid payment found' };
    if (record.method !== PaymentMethod.PAYPAL || !record.transactionId) {
      return {
        refunded: false,
        reason: 'PayPal capture reference is unavailable',
      };
    }
    try {
      const refund = await this.paypalRequest(
        `/v2/payments/captures/${encodeURIComponent(record.transactionId)}/refund`,
        {
          method: 'POST',
          headers: { 'PayPal-Request-Id': `refund-${record.transactionId}` },
          body: JSON.stringify({}),
        },
      );
      if (refund.status !== 'COMPLETED') {
        return {
          refunded: false,
          reason: `PayPal refund status is ${refund.status || 'unknown'}`,
        };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Refund failed for order ${orderId}`, err as Error);
      return { refunded: false, reason };
    }
    await this.paymentModel.updateOne(
      { _id: record._id },
      { $set: { status: Payments.REFUNDED } },
    );
    return { refunded: true };
  }
  private async sendPaymentReceipt(
    orderId: string,
    amount: number,
    currency: string,
  ) {
    try {
      const order = await this.orderModel
        .findById(orderId)
        .populate('customerId', 'email')
        .exec();
      const email =
        typeof order?.customerId === 'object'
          ? (order.customerId as { email?: string }).email
          : undefined;
      if (!email) return;
      await this.mailservice.sendPaymentReceipt({
        to: email,
        orderId,
        amount,
        currency: currency.toLowerCase(),
        itemsSummary: order?.items
          ?.map((item) => `${item.name} ×${item.qty}`)
          .join(', '),
      });
    } catch (err) {
      this.logger.warn('Payment receipt email failed', err as Error);
    }
  }
  create(createPaymentDto: Partial<payment>) {
    if (!createPaymentDto.transactionId)
      createPaymentDto.transactionId = randomUUID();
    if (!createPaymentDto.status) createPaymentDto.status = Payments.PENDING;
    if (!createPaymentDto.method)
      createPaymentDto.method = PaymentMethod.PAYPAL;
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
