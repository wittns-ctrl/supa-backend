import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CreateMailDto } from './dto/create-mail.dto';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendOtpEmail(to: string, otp: string) {
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to,
      subject: 'Your verification code',
      text: `your Otp:${otp}code will be expired in 5 minutes`,
      html: `<p>Your OTP code is <b>${otp}</b>.</p><p>It will expire in 5 minutes.</p>`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendContactEmail(dto: CreateMailDto) {
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const supportEmail = process.env.SUPPORT_EMAIL || from;

    await this.transporter.sendMail({
      from,
      to: supportEmail,
      replyTo: dto.email,
      subject: `SupaMeal Contact: ${dto.fullName}`,
      text: `From: ${dto.fullName} <${dto.email}>\n\n${dto.message}`,
      html: `<p><strong>From:</strong> ${dto.fullName} &lt;${dto.email}&gt;</p><p>${dto.message}</p>`,
    });
  }
}
