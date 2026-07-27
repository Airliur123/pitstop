import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import type { AuthMailer, MagicLinkMail } from './mailer.port';

@Injectable()
export class SmtpMailerService implements AuthMailer {
  private readonly transporter: Transporter;

  constructor(@Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider) {
    this.transporter = nodemailer.createTransport({
      host: environment.MAIL_HOST,
      port: environment.MAIL_PORT,
      secure: environment.MAIL_SECURE,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      ...(environment.MAIL_USER && environment.MAIL_PASSWORD
        ? {
            auth: {
              user: environment.MAIL_USER,
              pass: environment.MAIL_PASSWORD,
            },
          }
        : {}),
    });
  }

  async sendMagicLink(message: MagicLinkMail): Promise<void> {
    const validity = `${message.expiresInMinutes} menit`;
    await this.transporter.sendMail({
      from: `PitStop <${this.environment.MAIL_FROM_ADDRESS}>`,
      to: message.email,
      subject: 'Tautan masuk PitStop',
      text: [
        'Gunakan tautan berikut untuk masuk ke PitStop:',
        message.loginUrl,
        '',
        `Tautan ini hanya berlaku selama ${validity} dan hanya dapat digunakan satu kali.`,
        'Abaikan email ini jika kamu tidak meminta tautan masuk.',
      ].join('\n'),
      html: `<p>Gunakan tautan berikut untuk masuk ke PitStop:</p>
        <p><a href="${escapeHtml(message.loginUrl)}">Masuk ke PitStop</a></p>
        <p>Tautan ini hanya berlaku selama ${validity} dan hanya dapat digunakan satu kali.</p>
        <p>Abaikan email ini jika kamu tidak meminta tautan masuk.</p>`,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
