export const AUTH_MAILER = Symbol('AUTH_MAILER');

export interface MagicLinkMail {
  readonly email: string;
  readonly expiresInMinutes: number;
  readonly loginUrl: string;
}

export interface AuthMailer {
  sendMagicLink(message: MagicLinkMail): Promise<void>;
}
