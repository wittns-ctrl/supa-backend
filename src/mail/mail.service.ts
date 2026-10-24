import {
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { CreateMailDto } from './dto/create-mail.dto';
import { NewsletterUpdateDto } from './dto/newsletter-update.dto';
import {
  NewsletterSubscriber,
  NewsletterSubscriberDocument,
} from './schema/newsletter-subscriber.schema';
import {
  User,
  UserDocument,
  roles,
  UserStatus,
} from 'src/users/schema/user.schema';
import {
  notification,
  notificationDocument,
} from 'src/notifications/schema/notifications.schema';

/**
 * MailService sends application email through Resend's HTTPS API. Configure
 * RESEND_API_KEY and a sender address on a domain verified in Resend.
 */

/** Escapes user-provided text before interpolating into email HTML. */
function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private resendApiKey: string | null = null;

  constructor(
    @Optional()
    @InjectModel(NewsletterSubscriber.name)
    private readonly subscriberModel?: Model<NewsletterSubscriberDocument>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
    @Optional()
    @InjectModel(notification.name)
    private readonly notificationModel?: Model<notificationDocument>,
  ) {
    this.resendApiKey = process.env.RESEND_API_KEY?.trim() || null;
  }

  async onModuleInit() {
    if (!this.resendApiKey || !process.env.RESEND_FROM_EMAIL?.trim()) {
      this.logger.warn(
        'RESEND_API_KEY and RESEND_FROM_EMAIL are required for transactional email delivery.',
      );
      return;
    }
    this.logger.log('Resend email provider configured.');
  }

  // ── Delivery orchestrator ────────────────────────────────────────────────
  private async deliver(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<boolean> {
    return this.sendViaResend(to, subject, html, text);
  }

  // ── Resend.com API sender ──────────────────────────────────────────────────
  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<boolean> {
    if (!this.resendApiKey) return false;

    const from = process.env.RESEND_FROM_EMAIL?.trim() || '';
    if (!from) {
      this.logger.error(
        '[Resend] RESEND_FROM_EMAIL is not configured; email was not sent.',
      );
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html, text }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        this.logger.error(`[Resend] Failed: ${JSON.stringify(body)}`);
        return false;
      }

      const data = await response.json();
      this.logger.log(`[Resend] Email sent to ${to} — ID: ${data.id}`);
      return true;
    } catch (err) {
      this.logger.error(`[Resend] Error: ${err.message}`);
      return false;
    }
  }

  // ── Console fallback printer ───────────────────────────────────────────────
  private printToConsole(type: 'RESET' | 'CONTACT', to: string, value: string) {
    const line = '═'.repeat(62);
    const icons = {
      RESET: '🔑  PASSWORD RESET LINK',
      CONTACT: '📬  CONTACT FORM',
    };
    console.log(`\n${line}`);
    console.log(`  ${icons[type]}`);
    console.log(line);
    console.log(`  Recipient : ${to}`);
    if (type === 'RESET') console.log(`  Link      : ${value}`);
    if (type === 'CONTACT') console.log(`  Message   : ${value}`);
    if (type === 'RESET') console.log(`  Expires   : 15 minutes`);
    console.log(`${line}\n`);
  }

  // ── Send OTP email ────────────────────────────────────────────────────────
  async sendOtpEmail(
    to: string,
    otp: string,
    accountType: 'customer' | 'owner' = 'customer',
  ) {
    // Secret OTP is sent via email only - never printed to console logs
    const isOwner = accountType === 'owner';
    const subject = isOwner
      ? 'SupaMeal restaurant owner email verification'
      : '🍽️ Your SupaMeal Verification Code';
    const heading = isOwner
      ? 'Restaurant owner verification'
      : 'Email Verification';
    const introduction = isOwner
      ? 'Use this code to verify the email address for your SupaMeal restaurant owner account. Your restaurant application will be reviewed after verification.'
      : 'Hello! Use the code below to verify your email address.';
    const footer = isOwner
      ? 'If you did not submit a restaurant registration, you can safely ignore this email.'
      : "If you didn't create a SupaMeal account, you can safely ignore this email.";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#f5a623;font-size:22px;margin:0;">SupaMeal</h1>
          <p style="color:#999;font-size:13px;margin:4px 0 0;">${heading}</p>
        </div>
        <p style="color:#e0e0e0;font-size:15px;">${introduction}</p>
        <div style="background:#111;border:2px solid #f5a623;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
          <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#f5a623;">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px;text-align:center;">This code expires in <strong style="color:#e0e0e0;">5 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
        <p style="color:#555;font-size:12px;text-align:center;">${footer}</p>
      </div>
    `;
    const text = `${isOwner ? 'Verify your SupaMeal restaurant owner email' : 'Your SupaMeal verification code'}: ${otp}\nIt expires in 5 minutes.${isOwner ? '\nYour restaurant application will be reviewed after verification.' : ''}`;

    const sent = await this.deliver(to, subject, html, text);

    if (!sent) {
      this.logger.error(`[OTP] Email delivery failed for ${to}.`);
      throw new ServiceUnavailableException(
        'We could not send the verification email right now. Please try again shortly or request a new code.',
      );
    }
  }

  async sendOwnerVerificationCompleteEmail(
    to: string,
    ownerName: string,
    restaurantName: string,
  ) {
    const safeOwnerName = escapeHtml(ownerName || 'there');
    const safeRestaurantName = escapeHtml(restaurantName || 'your restaurant');
    const subject = 'SupaMeal received your restaurant application';
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;"><h1 style="color:#f5a623;font-size:22px;">SupaMeal</h1><p style="color:#e0e0e0;font-size:15px;">Hello ${safeOwnerName}, your email is verified and we received the application for <strong>${safeRestaurantName}</strong>.</p><p style="color:#e0e0e0;font-size:15px;">Our team will review the restaurant details. You can sign in to the restaurant owner portal after your application is approved.</p><p style="color:#999;font-size:13px;">We will email you when the review is complete.</p></div>`;
    const text = `Hello ${ownerName || 'there'}, your email is verified and we received the application for ${restaurantName || 'your restaurant'}. Our team will review the details and email you when the review is complete. You can sign in to the restaurant owner portal after approval.`;
    const sent = await this.deliver(to, subject, html, text);
    if (!sent)
      this.logger.warn(
        `[OWNER REGISTRATION] Verification confirmation email could not be delivered to ${to}.`,
      );
  }

  async sendRestaurantDecisionEmail(
    to: string,
    restaurantName: string,
    approved: boolean,
    rejectionReason?: string,
  ) {
    const safeRestaurantName = escapeHtml(restaurantName || 'your restaurant');
    const safeReason = rejectionReason?.trim()
      ? escapeHtml(rejectionReason.trim())
      : '';
    const subject = approved
      ? 'Your SupaMeal restaurant application is approved'
      : 'An update about your SupaMeal restaurant application';
    const message = approved
      ? `Your restaurant <strong>${safeRestaurantName}</strong> has been approved. You can now sign in to the restaurant owner portal.`
      : `We could not approve the application for <strong>${safeRestaurantName}</strong>${safeReason ? `. Review note: ${safeReason}` : ''}. Please contact support if you need help.`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;"><h1 style="color:#f5a623;font-size:22px;">SupaMeal restaurant review</h1><p style="color:#e0e0e0;font-size:15px;line-height:1.6;">${message}</p></div>`;
    const text = approved
      ? `Your restaurant ${restaurantName} has been approved. You can now sign in to the restaurant owner portal.`
      : `We could not approve the application for ${restaurantName}.${safeReason ? ` Review note: ${rejectionReason!.trim()}.` : ''} Please contact support if you need help.`;
    const sent = await this.deliver(to, subject, html, text);
    if (!sent)
      this.logger.warn(
        `[RESTAURANT REVIEW] Decision email could not be delivered to ${to}.`,
      );
  }

  // ── Send password reset email ─────────────────────────────────────────────
  async sendResetEmail(to: string, resetLink: string) {
    const subject = '🔑 Reset your SupaMeal password';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#f5a623;font-size:22px;margin:0;">SupaMeal</h1>
          <p style="color:#999;font-size:13px;margin:4px 0 0;">Password Reset</p>
        </div>
        <p style="color:#e0e0e0;font-size:15px;">We received a request to reset your password. Click the button below to proceed.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${resetLink}" style="background:#f5a623;color:#111;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Reset Password</a>
        </div>
        <p style="color:#888;font-size:13px;text-align:center;">Or copy and paste this link:</p>
        <p style="color:#f5a623;font-size:12px;text-align:center;word-break:break-all;"><a href="${resetLink}" style="color:#f5a623;">${resetLink}</a></p>
        <p style="color:#888;font-size:13px;text-align:center;margin-top:20px;">This link expires in <strong style="color:#e0e0e0;">15 minutes</strong>.</p>
        <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
        <p style="color:#555;font-size:12px;text-align:center;">If you didn't request this, ignore this email — your password won't change.</p>
      </div>
    `;
    const text = `Reset your SupaMeal password: ${resetLink}\nThis link expires in 15 minutes.`;

    const sent = await this.deliver(to, subject, html, text);

    if (!sent) {
      // Only dump the live reset link to the console when no provider
      // actually delivered the email — otherwise it leaks into server logs.
      this.printToConsole('RESET', to, resetLink);
      this.logger.warn(
        `[RESET] Email delivery failed — reset link for ${to} is visible in the server console above.`,
      );
    }
  }

  // ── Send payment receipt email ──────────────────────────────────────────
  /**
   * Receipt for a completed payment, sent after server-side provider verification.
   */
  async sendPaymentReceipt(params: {
    to: string;
    orderId: string;
    amount: number;
    currency: string;
    itemsSummary?: string;
    restaurantName?: string;
  }) {
    const { to, orderId, amount, currency, itemsSummary, restaurantName } =
      params;

    const subject = `🧾 Your SupaMeal receipt — order #${orderId.slice(-6)}`;
    const safeRestaurant = escapeHtml(restaurantName || 'SupaMeal');
    const safeItems = escapeHtml(itemsSummary || 'Your order');
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#f5a623;font-size:22px;margin:0;">SupaMeal</h1>
          <p style="color:#999;font-size:13px;margin:4px 0 0;">Payment Receipt</p>
        </div>
        <p style="color:#e0e0e0;font-size:15px;">Thanks for your order from <strong style="color:#f5a623;">${safeRestaurant}</strong>!</p>
        <div style="background:#111;border:1px solid #333;border-radius:12px;padding:20px;margin:20px 0;">
          <div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;margin-bottom:8px;">
            <span>Order</span><span style="font-weight:700;">#${orderId.slice(-6)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;margin-bottom:8px;">
            <span>Items</span><span>${safeItems}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#f5a623;font-size:18px;font-weight:900;border-top:1px solid #333;padding-top:12px;margin-top:8px;">
            <span>Total paid</span><span>${amount.toFixed(2)} ${currency.toUpperCase()}</span>
          </div>
        </div>
        <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
        <p style="color:#555;font-size:12px;text-align:center;">Questions about this charge? Contact ${escapeHtml(process.env.SUPPORT_EMAIL || 'mugishawitness15@gmail.com')}</p>
      </div>
    `;
    const text = `SupaMeal receipt — order #${orderId.slice(-6)}: ${amount.toFixed(2)} ${currency.toUpperCase()} paid to ${restaurantName || 'SupaMeal'}.`;

    const sent = await this.deliver(to, subject, html, text);

    if (!sent) {
      this.logger.warn(
        `[RECEIPT] Email delivery not configured — receipt for order ${orderId} was not sent.`,
      );
    }
  }

  // ── Send contact form email ───────────────────────────────────────────
  async sendContactEmail(dto: CreateMailDto) {
    const supportEmail =
      process.env.SUPPORT_EMAIL?.trim() || 'support@supameal.com';

    const subject = `SupaMeal Contact: ${escapeHtml(dto.fullName)}`;
    const safeName = escapeHtml(dto.fullName);
    const safeEmail = escapeHtml(dto.email);
    const safeMessage = escapeHtml(dto.message).replace(/\n/g, '<br />');
    const html = `<p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p><p>${safeMessage}</p>`;
    const text = `From: ${dto.fullName} <${dto.email}>\n\n${dto.message}`;

    const sent = await this.deliver(supportEmail, subject, html, text);

    if (!sent) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Please try again later or contact support directly.',
      );
    }
  }

  async subscribeToNewsletter(email: string) {
    if (!this.subscriberModel) {
      throw new ServiceUnavailableException(
        'Newsletter subscriptions are not available right now.',
      );
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existingSubscriber = await this.subscriberModel
      .findOne({ email: normalizedEmail })
      .exec();
    if (existingSubscriber?.isActive) {
      return {
        message: 'This email is already subscribed.',
        alreadySubscribed: true,
        emailSent: false,
      };
    }

    const subscriber = await this.subscriberModel
      .findOneAndUpdate(
        { email: normalizedEmail },
        {
          $set: { isActive: true },
          $setOnInsert: {
            email: normalizedEmail,
            unsubscribeToken: randomUUID(),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();

    const supportEmail =
      process.env.SUPPORT_EMAIL?.trim() || 'support@supameal.com';
    const safeSupportEmail = escapeHtml(supportEmail);
    const unsubscribeUrl = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/newsletter/unsubscribe/${encodeURIComponent(subscriber.unsubscribeToken)}`;
    const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
    const subject = 'Welcome to SupaMeal updates';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;">
        <h1 style="color:#f5a623;font-size:22px;margin:0 0 18px;">Welcome to SupaMeal</h1>
        <p style="color:#e0e0e0;font-size:15px;line-height:1.6;">You’re subscribed to SupaMeal updates. We’ll send you news about new restaurants, dining offers, and platform updates.</p>
        <p style="color:#999;font-size:13px;line-height:1.6;">Questions? Contact <a style="color:#f5a623;" href="mailto:${safeSupportEmail}">${safeSupportEmail}</a>.</p>
        <p style="color:#777;font-size:12px;"><a style="color:#f5a623;" href="${safeUnsubscribeUrl}">Unsubscribe</a> from these updates.</p>
      </div>
    `;
    const text = `You’re subscribed to SupaMeal updates. We’ll send you news about new restaurants, dining offers, and platform updates.\n\nUnsubscribe: ${unsubscribeUrl}`;
    const emailSent = await this.deliver(normalizedEmail, subject, html, text);

    if (!emailSent) {
      this.logger.warn(
        `Newsletter subscription saved for ${normalizedEmail}, but the welcome email could not be delivered.`,
      );
    }
    return {
      message: emailSent
        ? 'Subscription confirmed. Check your inbox for a welcome email.'
        : 'Subscription saved. Email delivery is temporarily unavailable.',
      alreadySubscribed: false,
      emailSent,
    };
  }

  async unsubscribeFromNewsletter(token: string) {
    if (!this.subscriberModel || !token) {
      throw new ServiceUnavailableException(
        'Newsletter preferences are not available right now.',
      );
    }
    await this.subscriberModel
      .findOneAndUpdate(
        { unsubscribeToken: token },
        { $set: { isActive: false } },
      )
      .exec();
    return { message: 'Newsletter preferences updated.' };
  }

  async sendNewsletterUpdate(dto: NewsletterUpdateDto) {
    if (!this.subscriberModel || !this.userModel || !this.notificationModel) {
      throw new ServiceUnavailableException(
        'Newsletter delivery is not available right now.',
      );
    }
    const subscriberModel = this.subscriberModel;
    const userModel = this.userModel;
    const notificationModel = this.notificationModel;

    const subjectText = dto.subject.trim();
    const messageText = dto.message.trim();
    const recipientCursor = userModel
      .find({
        role: { $in: [roles.CUSTOMER, roles.OWNER] },
        status: UserStatus.ACTIVE,
      })
      .select('_id')
      .lean()
      .cursor();

    let inAppSent = 0;
    let notificationBatch: {
      userId: unknown;
      title: string;
      message: string;
      isRead: boolean;
    }[] = [];
    const flushNotifications = async () => {
      if (!notificationBatch.length) return;
      const created = await notificationModel.insertMany(notificationBatch);
      inAppSent += created.length;
      notificationBatch = [];
    };
    for await (const recipient of recipientCursor) {
      notificationBatch.push({
        userId: recipient._id,
        title: subjectText,
        message: messageText,
        isRead: false,
      });
      if (notificationBatch.length === 500) await flushNotifications();
    }
    await flushNotifications();

    const subscriberCursor = subscriberModel
      .find({ isActive: true })
      .select('email unsubscribeToken')
      .lean()
      .cursor();

    const subject = `[SupaMeal Update] ${subjectText}`;
    const safeSubject = escapeHtml(subjectText);
    const safeMessage = escapeHtml(messageText).replace(/\n/g, '<br />');
    const supportEmail =
      process.env.SUPPORT_EMAIL?.trim() || 'support@supameal.com';
    let sent = 0;
    let failed = 0;
    let total = 0;
    const sendBatch = async (
      batch: { email: string; unsubscribeToken: string }[],
    ) => {
      const batchResults = await Promise.all(
        batch.map((subscriber) => {
          const unsubscribeUrl = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/newsletter/unsubscribe/${encodeURIComponent(subscriber.unsubscribeToken)}`;
          const safeUrl = escapeHtml(unsubscribeUrl);
          const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;"><h1 style="color:#f5a623;font-size:22px;">SupaMeal Update</h1><h2 style="color:#e0e0e0;font-size:18px;">${safeSubject}</h2><p style="color:#e0e0e0;font-size:15px;line-height:1.7;">${safeMessage}</p><p style="color:#999;font-size:12px;">Questions? <a style="color:#f5a623;" href="mailto:${escapeHtml(supportEmail)}">Contact us</a>. <a style="color:#f5a623;" href="${safeUrl}">Unsubscribe</a></p></div>`;
          const text = `${subjectText}\n\n${messageText}\n\nUnsubscribe: ${unsubscribeUrl}`;
          return this.deliver(subscriber.email, subject, html, text);
        }),
      );
      total += batchResults.length;
      sent += batchResults.filter(Boolean).length;
      failed += batchResults.filter((delivered) => !delivered).length;
    };
    let subscriberBatch: { email: string; unsubscribeToken: string }[] = [];
    for await (const subscriber of subscriberCursor) {
      subscriberBatch.push(subscriber);
      if (subscriberBatch.length === 10) {
        await sendBatch(subscriberBatch);
        subscriberBatch = [];
      }
    }
    if (subscriberBatch.length) await sendBatch(subscriberBatch);

    if (sent === 0 && inAppSent === 0 && total > 0) {
      throw new ServiceUnavailableException(
        'Newsletter delivery failed. Check the configured email provider and try again.',
      );
    }
    this.logger.log(
      `Newsletter update delivered to ${sent} of ${total} subscribers (${failed} failed).`,
    );
    return { sent, failed, total, inAppSent };
  }
}
