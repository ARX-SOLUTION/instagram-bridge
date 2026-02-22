import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TelegramService } from '../telegram/telegram.service';

interface WebhookChange {
  field?: string;
  value?: Record<string, unknown>;
}

interface WebhookMessaging {
  sender?: { id: string };
  recipient?: { id: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
  [key: string]: unknown;
}

interface WebhookEntry {
  id?: string;
  time?: number;
  changes?: WebhookChange[];
  messaging?: WebhookMessaging[];
}

interface WebhookEvent {
  object?: string;
  entry?: WebhookEntry[];
}

interface GraphPayload {
  source: 'instagram_graph';
  object?: string;
  entryId?: string;
  time?: number;
  field?: string;
  value?: Record<string, unknown>;
}

interface DmPayload {
  source: 'instagram_dm';
  object?: string;
  entryId?: string;
  time?: number;
  messaging: WebhookMessaging;
}

interface UnknownPayload {
  source: 'instagram_unknown';
  object?: string;
  entry: WebhookEntry;
}

type ForwardPayload = GraphPayload | DmPayload | UnknownPayload;

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  private readonly seen = new Map<string, number>();
  private readonly SEEN_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  validateVerifyToken(token?: string): boolean {
    const verifyToken = this.configService.get<string>(
      'INSTAGRAM_VERIFY_TOKEN',
      '',
    );
    return !!token && token === verifyToken;
  }

  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    if (!event?.entry || !Array.isArray(event.entry)) {
      this.logger.warn('Webhook payload has no entry[]');
      return;
    }

    for (const entry of event.entry) {
      if (Array.isArray(entry.changes)) {
        for (const ch of entry.changes) {
          const payload: GraphPayload = {
            source: 'instagram_graph',
            object: event.object,
            entryId: entry.id,
            time: entry.time,
            field: ch.field,
            value: ch.value,
          };
          await this.forwardIfNew(payload);
        }
      }

      if (Array.isArray(entry.messaging)) {
        for (const m of entry.messaging) {
          const payload: DmPayload = {
            source: 'instagram_dm',
            object: event.object,
            entryId: entry.id,
            time: entry.time,
            messaging: m,
          };
          await this.forwardIfNew(payload);
        }
      }

      if (!entry.changes && !entry.messaging) {
        await this.forwardIfNew({
          source: 'instagram_unknown',
          object: event.object,
          entry,
        });
      }
    }

    this.cleanupSeen();
  }

  private async forwardIfNew(payload: ForwardPayload): Promise<void> {
    const key = this.makeEventKey(payload);
    if (this.seen.has(key)) return;
    this.seen.set(key, Date.now());

    const text = this.formatTelegramMessage(payload);
    await this.telegramService.sendMessage(text);
  }

  private makeEventKey(payload: ForwardPayload): string {
    if (payload.source === 'instagram_dm') {
      const mid = payload.messaging?.message?.mid;
      if (mid) return `mid:${mid}`;
    }

    if (payload.source === 'instagram_graph') {
      const changeId =
        (payload.value?.id as string | undefined) ||
        (payload.value?.comment_id as string | undefined);
      if (changeId) return `chg:${payload.field ?? ''}:${changeId}`;
    }

    const s = JSON.stringify(payload);
    return 'h:' + crypto.createHash('sha256').update(s).digest('hex');
  }

  private cleanupSeen(): void {
    const now = Date.now();
    for (const [k, t] of this.seen.entries()) {
      if (now - t > this.SEEN_TTL_MS) this.seen.delete(k);
    }
  }

  private formatTelegramMessage(payload: ForwardPayload): string {
    try {
      if (payload.source === 'instagram_dm') {
        const m = payload.messaging;
        const sender = m?.sender?.id;
        const recipient = m?.recipient?.id;
        const text = m?.message?.text;
        const isEcho = m?.message?.is_echo;

        const lines = [
          'IG DM Event',
          sender ? `from: ${sender}` : '',
          recipient ? `to: ${recipient}` : '',
          isEcho ? '(echo)' : '',
          text ? `text: ${text}` : '',
        ].filter(Boolean);

        if (!text) lines.push(`payload: ${this.shortJson(m)}`);
        return lines.join('\n');
      }

      if (payload.source === 'instagram_graph') {
        const field = payload.field;
        const value = payload.value;
        return [
          'IG Graph Event',
          field ? `field: ${String(field)}` : '',
          `value: ${this.shortJson(value)}`,
        ]
          .filter(Boolean)
          .join('\n');
      }

      return `IG Unknown Event\npayload: ${this.shortJson(payload)}`;
    } catch {
      return `IG Event\npayload: ${this.shortJson(payload)}`;
    }
  }

  private shortJson(obj: unknown): string {
    const s = JSON.stringify(obj);
    return s.length > 1500 ? s.slice(0, 1500) + '...' : s;
  }
}
