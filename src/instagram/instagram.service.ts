import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { InstagramPost } from './entities/instagram-post.entity';
import { InstagramActivityEvent } from './events/instagram-activity.event';
import { MediaReceivedEvent } from './events/media-received.event';

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink: string;
  timestamp: string;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly accessToken: string;
  private readonly verifyToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(InstagramPost)
    private readonly postRepository: Repository<InstagramPost>,
  ) {
    this.accessToken = this.configService.get<string>(
      'INSTAGRAM_ACCESS_TOKEN',
      '',
    );
    this.verifyToken = this.configService.get<string>(
      'INSTAGRAM_VERIFY_TOKEN',
      '',
    );
  }

  validateVerifyToken(token: string): boolean {
    return token === this.verifyToken;
  }

  async processWebhookEvent(event: WebhookEventDto): Promise<void> {
    this.logger.log(
      `Webhook received | object=${event.object} | entries=${event.entry.length}`,
    );

    for (const entry of event.entry) {
      this.logger.log(`Processing entry | id=${entry.id}`);

      // =========================================================
      // 1. KOMMENTLAR, POSTLAR VA MENTIONLAR (changes)
      // =========================================================
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          this.logger.log(`Webhook change | field="${change.field}"`);

          switch (change.field) {
            case 'feed':
            case 'mentions': {
              this.logger.log(`Event type: ${change.field.toUpperCase()}`);
              const mediaId =
                this.getStr(change.value, 'media_id') ||
                this.getStr(change.value, 'id');
              if (mediaId) {
                await this.processMedia(mediaId);
              } else {
                this.logger.warn(
                  `Event has no media_id: ${JSON.stringify(change.value)}`,
                );
              }
              break;
            }

            case 'comments':
            case 'live_comments': {
              this.logger.log(`Event type: ${change.field.toUpperCase()}`);
              this.handleComment(change.value);
              await this.emitActivity(
                'comment',
                this.formatComment(change.value),
              );
              break;
            }

            case 'story_insights': {
              this.logger.log('Event type: STORY INSIGHTS');
              await this.emitActivity(
                'story_insights',
                this.formatStoryInsight(change.value),
              );
              break;
            }

            default: {
              // Boshqa barcha changes turlari
              this.logger.warn(`Unknown change field: "${change.field}"`);
              await this.emitActivity(
                change.field,
                `❓ Unknown change event: ${change.field}`,
              );
              break;
            }
          }
        }
      }

      // =========================================================
      // 2. DIRECT XABARLAR VA REAKSIYALAR (messaging)
      // =========================================================
      if (entry.messaging) {
        for (const msgEvent of entry.messaging) {
          const senderId = msgEvent.sender?.id ?? 'unknown';

          if (msgEvent.message?.text) {
            const text = msgEvent.message.text;
            this.logger.log(
              `Event type: DIRECT MESSAGE | sender=${senderId} | text="${text}"`,
            );

            await this.emitActivity(
              'message',
              `✉️ Direct message\nSender ID: ${senderId}\nText: ${text}`,
            );

            if (msgEvent.sender?.id) {
              const replyMessage = `Assalomu alaykum! Xabaringizni qabul qildik tez orada operatorlarimiz javob berishadi!\nSizning xabaringiz: "${text}"`;
              await this.sendDirectMessage(msgEvent.sender.id, replyMessage);
            }
          } else if (msgEvent.read) {
            this.logger.log(`Event type: MESSAGE SEEN | sender=${senderId}`);
            await this.emitActivity(
              'messaging_seen',
              `👁 Message seen\nSender: ${senderId}`,
            );
          } else if (msgEvent.postback) {
            this.logger.log(`Event type: POSTBACK | sender=${senderId}`);
            await this.emitActivity(
              'postback',
              `🔘 Postback\nSender: ${senderId}\nPayload: ${msgEvent.postback.payload ?? 'N/A'}`,
            );
          } else {
            this.logger.warn(
              `Unknown messaging event: ${JSON.stringify(msgEvent)}`,
            );
          }
        }
      }
    }
  }

  // =========================================================
  // JAVOB YUBORISH METODI (META GRAPH API)
  // =========================================================
  async sendDirectMessage(
    recipientId: string,
    messageText: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/v18.0/me/messages`;

    if (!this.accessToken) {
      this.logger.error('Instagram access token is not configured!');
      return;
    }

    try {
      this.logger.log(`Sending Auto-Reply to ID: ${recipientId}...`);

      await lastValueFrom(
        this.httpService.post(
          url,
          {
            recipient: { id: recipientId },
            message: { text: messageText },
          },
          {
            params: { access_token: this.accessToken },
          },
        ),
      );

      this.logger.log(`Auto-Reply successfully sent to ${recipientId}`);
    } catch (error) {
      const err = error as Error & {
        response?: { data?: { error?: { message?: string } } };
      };
      this.logger.error('Failed to send Auto-Reply message');
      this.logger.error(err.response?.data?.error?.message || err.message);
    }
  }

  // =========================================================
  // YORDAMCHI FUNKSIYALAR
  // =========================================================
  private getStr(
    obj: Record<string, unknown>,
    path: string,
    fallback = '',
  ): string {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (
        current !== null &&
        current !== undefined &&
        typeof current === 'object'
      ) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return fallback;
      }
    }

    if (current === null || current === undefined) return fallback;
    if (typeof current === 'string') return current;
    if (typeof current === 'number' || typeof current === 'boolean') {
      return current.toString();
    }
    return JSON.stringify(current);
  }

  private handleComment(value: Record<string, unknown>): void {
    const text = this.getStr(value, 'text');
    const from =
      this.getStr(value, 'from.username') ||
      this.getStr(value, 'from.id', 'unknown');
    this.logger.log(`Comment from ${from}: "${text}"`);
  }

  private async emitActivity(type: string, message: string): Promise<void> {
    await this.eventEmitter.emitAsync(
      'instagram.activity',
      new InstagramActivityEvent(type, message),
    );
  }

  private formatComment(value: Record<string, unknown>): string {
    const from =
      this.getStr(value, 'from.username') ||
      this.getStr(value, 'from.id', 'unknown');
    const text = this.getStr(value, 'text');
    const mediaId = this.getStr(value, 'media.id');
    return `💬 New comment\nFrom: ${from}\nText: ${text}${mediaId ? `\nMedia: ${mediaId}` : ''}`;
  }

  private formatStoryInsight(value: Record<string, unknown>): string {
    const mediaId =
      this.getStr(value, 'media_id') || this.getStr(value, 'id', 'unknown');
    const impressions = this.getStr(value, 'impressions', 'N/A');
    const reach = this.getStr(value, 'reach', 'N/A');
    return `📊 Story insight\nMedia: ${mediaId}\nImpressions: ${impressions}\nReach: ${reach}`;
  }

  private async processMedia(mediaId: string): Promise<void> {
    const existing = await this.postRepository.findOne({ where: { mediaId } });
    if (existing) {
      this.logger.log(`Media ${mediaId} already processed. Skipping.`);
      return;
    }

    try {
      const media = await this.fetchMediaDetails(mediaId);

      const post = this.postRepository.create({
        mediaId: media.id,
        caption: media.caption,
        mediaUrl: media.media_url,
        createdAt: new Date(media.timestamp),
      });
      await this.postRepository.save(post);
      this.logger.log(`Saved media ${mediaId} to DB`);

      await this.eventEmitter.emitAsync(
        'media.received',
        new MediaReceivedEvent(
          post.mediaId,
          post.caption,
          post.mediaUrl,
          media.media_type,
          media.permalink,
          media.timestamp,
        ),
      );
      this.logger.log(`Emitted media.received event for ${mediaId}`);

      post.forwarded = true;
      await this.postRepository.save(post);
    } catch (error: unknown) {
      this.logger.error(
        `Error processing media ${mediaId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async fetchMediaDetails(mediaId: string): Promise<InstagramMedia> {
    const url = `https://graph.instagram.com/${mediaId}`;
    const params = {
      fields: 'id,caption,media_type,media_url,permalink,timestamp',
      access_token: this.accessToken,
    };

    try {
      const response = await lastValueFrom(
        this.httpService.get<InstagramMedia>(url, { params }),
      );
      return response.data;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to fetch media details for ${mediaId}`,
        err.stack,
      );
      throw error;
    }
  }
}
