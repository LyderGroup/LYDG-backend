import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
  constructor(private readonly configService: ConfigService) {}

  private getSmtpTransport() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !port || !user || !pass) {
      return null;
    }

    const portNumber = parseInt(port, 10);
    const secure = portNumber === 465;

    return nodemailer.createTransport({
      host,
      port: portNumber,
      secure,
      auth: { user, pass },
    });
  }

  async sendInviteEmail(payload: { toEmail: string; resetLink: string; firstName?: string | null; lastName?: string | null }) {
    const from = this.configService.get<string>('SMTP_FROM');
    const transport = this.getSmtpTransport();

    if (!from || !transport) {
      console.log('[INVITE][EMAIL][SKIP] Missing SMTP config. to=', payload.toEmail);
      console.log(payload.resetLink);
      return;
    }

    const name = `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim();

    await transport.sendMail({
      from,
      to: payload.toEmail,
      subject: 'Activation de votre compte',
      text: name
        ? `Bonjour ${name},\n\nVeuillez définir votre mot de passe en cliquant sur ce lien :\n${payload.resetLink}\n\nMerci.`
        : `Bonjour,\n\nVeuillez définir votre mot de passe en cliquant sur ce lien :\n${payload.resetLink}\n\nMerci.`,
    });
  }
}
