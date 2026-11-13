import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

interface Alert {
  to: string;
  incidentId: string;
  kind: 'critical' | 'assignment';
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transport;
  private readonly pending: Alert[] = [];
  private active = 0;
  private closed = false;

  constructor(private readonly config: ConfigService) {
    const user = config.getOrThrow<string>('MAIL_USER');
    this.transport = nodemailer.createTransport({
      host: config.getOrThrow<string>('MAIL_HOST'),
      port: config.getOrThrow<number>('MAIL_PORT'),
      secure: config.getOrThrow<number>('MAIL_PORT') === 465,
      ...(user
        ? { auth: { user, pass: config.getOrThrow<string>('MAIL_PASSWORD') } }
        : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      logger: false,
      debug: false,
    });
  }

  enqueue(alert: Alert) {
    if (this.closed || this.pending.length >= 1000) {
      this.logger.warn('Email queue unavailable; alert not queued');
      return;
    }
    this.pending.push(alert);
    // SMTP never blocks or rejects a committed business request.
    setImmediate(() => this.drain());
  }

  private drain() {
    while (!this.closed && this.active < 4 && this.pending.length) {
      const alert = this.pending.shift()!;
      this.active++;
      const subject =
        alert.kind === 'critical'
          ? 'SafeOps: Cảnh báo sự cố CRITICAL'
          : 'SafeOps: Bạn có nhiệm vụ mới';
      const url = new URL(
        `/incidents/${encodeURIComponent(alert.incidentId)}`,
        this.config.getOrThrow<string>('FRONTEND_URL').split(',')[0],
      );
      void this.transport
        .sendMail({
          from: this.config.getOrThrow<string>('MAIL_FROM'),
          to: alert.to,
          subject,
          text: `${subject}\nĐăng nhập SafeOps để xem chi tiết: ${url.href}`,
        })
        .catch(() => {
          // SMTP errors may contain addresses, credentials or message content.
          this.logger.warn('Email delivery failed');
        })
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }

  onModuleDestroy() {
    this.closed = true;
    this.pending.length = 0;
    this.transport.close();
  }
}
