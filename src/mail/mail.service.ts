import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CreateMailDto } from './dto/create-mail.dto';

/**
 * MailService — tries SMTP first; falls back to console logging.
 *
 * Gmail App Password Setup (to enable real email delivery):
 *   1. Go to https://myaccount.google.com/apppasswords
 *   2. Enable 2-Step Verification first if not done
 *   3. Create an App Password for "Mail"
 *   4. Set SMTP_PASS=<16-char-password> in .env (no spaces)
 *   5. Set SMTP_USER=your-gmail@gmail.com
 *
 * Alternative — Resend.com (recommended, free 100 emails/day):
 *   1. Sign up at https://resend.com (free, no credit card)
 *   2. Get your API key
 *   3. Set RESEND_API_KEY=re_xxxxxxxx in .env
 *   4. Set FROM_EMAIL=onboarding@resend.dev (or your verified domain)
 */

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter | null = null;
  private readonly logger = new Logger(MailService.name);
  private smtpReady = false;
  private resendApiKey: string | null = null;

  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY?.trim() || null;
    this.initTransporter();
  }

  private initTransporter() {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;

    if (!user || !pass) {
      this.logger.warn('[MailService] SMTP_USER or SMTP_PASS not set. Email sending disabled.');
      return;
    }

    // Use Gmail service shorthand if host is gmail — handles auth better
    const isGmail = host.includes('gmail.com') || host.includes('googlemail.com');

    const config: nodemailer.TransportOptions = isGmail
      ? ({
          service: 'gmail',
          auth: { user, pass },
        } as any)
      : {
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
        };

    this.transporter = nodemailer.createTransport(config);
  }

  async onModuleInit() {
    // Try Resend API first (most reliable)
    if (this.resendApiKey) {
      this.logger.log('✅ Resend API key detected — will use Resend for email delivery.');
      this.smtpReady = true;
      return;
    }

    // Try SMTP
    if (!this.transporter) {
      this.logger.warn(
        '⚠️  No email provider configured. OTPs/links will be logged to console.\n' +
        '   → Option A (Gmail): Set SMTP_USER + SMTP_PASS (Gmail App Password) in .env\n' +
        '   → Option B (Free): Sign up at https://resend.com and set RESEND_API_KEY in .env',
      );
      return;
    }

    try {
      await this.transporter.verify();
      this.smtpReady = true;
      this.logger.log('✅ SMTP verified — emails will be sent to inbox.');
    } catch (err) {
      this.smtpReady = false;
      this.logger.warn(
        `⚠️  SMTP FAILED: ${err.message}\n` +
        '   OTPs/reset links will be printed to this console instead.\n' +
        '   Fix options:\n' +
        '   A) Gmail App Password: https://myaccount.google.com/apppasswords → update SMTP_PASS in .env\n' +
        '   B) Free email (Resend): https://resend.com → set RESEND_API_KEY in .env (100 emails/day free)',
      );
    }
  }

  // ── Resend.com API sender ──────────────────────────────────────────────────
  private async sendViaResend(to: string, subject: string, html: string, text: string): Promise<boolean> {
    if (!this.resendApiKey) return false;

    let from = process.env.FROM_EMAIL?.trim() || 'onboarding@resend.dev';
    // Resend requires verified domain or onboarding@resend.dev
    if (from.includes('@gmail.com') || from.includes('@yahoo.com') || from.includes('@hotmail.com')) {
      from = 'SupaMeal <onboarding@resend.dev>';
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html, text }),
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

  // ── SMTP sender ───────────────────────────────────────────────────────────
  private async sendViaSmtp(to: string, subject: string, html: string, text: string): Promise<boolean> {
    if (!this.transporter || !this.smtpReady) return false;

    const from = process.env.FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim() || 'no-reply@supameal.com';

    try {
      const info = await this.transporter.sendMail({ from, to, subject, html, text });
      this.logger.log(`[SMTP] Email sent to ${to} — ID: ${info.messageId}`);
      return true;
    } catch (err) {
      this.smtpReady = false;
      this.logger.error(`[SMTP] Failed for ${to}: ${err.message}`);
      return false;
    }
  }

  // ── Console fallback printer ───────────────────────────────────────────────
  private printToConsole(type: 'RESET' | 'CONTACT', to: string, value: string) {
    const line = '═'.repeat(62);
    const icons = { RESET: '🔑  PASSWORD RESET LINK', CONTACT: '📬  CONTACT FORM' };
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
  async sendOtpEmail(to: string, otp: string) {
    // Secret OTP is sent via email only - never printed to console logs
    const subject = '🍽️ Your SupaMeal Verification Code';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#1a1a1a;border:1px solid #333;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#f5a623;font-size:22px;margin:0;">SupaMeal</h1>
          <p style="color:#999;font-size:13px;margin:4px 0 0;">Email Verification</p>
        </div>
        <p style="color:#e0e0e0;font-size:15px;">Hello! Use the code below to verify your email address.</p>
        <div style="background:#111;border:2px solid #f5a623;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
          <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#f5a623;">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px;text-align:center;">This code expires in <strong style="color:#e0e0e0;">5 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
        <p style="color:#555;font-size:12px;text-align:center;">If you didn't create a SupaMeal account, you can safely ignore this email.</p>
      </div>
    `;
    const text = `Your SupaMeal verification code is: ${otp}\nIt expires in 5 minutes.`;

    const sent = await this.sendViaResend(to, subject, html, text)
      || await this.sendViaSmtp(to, subject, html, text);

    if (!sent) {
      this.logger.warn(`[OTP] Email delivery attempt completed for ${to}.`);
    }
  }

  // ── Send password reset email ─────────────────────────────────────────────
  async sendResetEmail(to: string, resetLink: string) {
    this.printToConsole('RESET', to, resetLink);

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

    const sent = await this.sendViaResend(to, subject, html, text)
      || await this.sendViaSmtp(to, subject, html, text);

    if (!sent) {
      this.logger.warn(`[RESET] Email delivery failed — reset link for ${to} is visible in the server console above.`);
    }
  }

  // ── Send contact form email ───────────────────────────────────────────────
  async sendContactEmail(dto: CreateMailDto) {
    const supportEmail = process.env.SUPPORT_EMAIL?.trim()
      || process.env.SMTP_USER?.trim()
      || 'support@supameal.com';

    this.printToConsole('CONTACT', supportEmail, `From ${dto.email}: ${dto.message}`);

    const subject = `SupaMeal Contact: ${dto.fullName}`;
    const html = `<p><strong>From:</strong> ${dto.fullName} &lt;${dto.email}&gt;</p><p>${dto.message}</p>`;
    const text = `From: ${dto.fullName} <${dto.email}>\n\n${dto.message}`;

    await this.sendViaResend(supportEmail, subject, html, text)
      || await this.sendViaSmtp(supportEmail, subject, html, text);
  }
}
