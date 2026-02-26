import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { WebhookEventDto } from './dto/webhook-event.dto.js';
import { InstagramPost } from './entities/instagram-post.entity.js';
import { MediaReceivedEvent } from './events/media-received.event.js';

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
    private readonly telegramService: TelegramService,
    private readonly commonService: CommonService,
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
    this.logger.debug(`Raw webhook payload: ${JSON.stringify(event)}`);

    for (const entry of event.entry) {
      this.logger.log(`Processing entry | id=${entry.id}`);

      for (const change of entry.changes) {
        this.logger.log(
          `Webhook change | field="${change.field}" | entry=${entry.id}`,
        );
        this.logger.debug(`Change value: ${JSON.stringify(change.value)}`);

        switch (change.field) {
          case 'feed': {
            this.logger.log('Event type: NEW FEED POST');
            const mediaId =
              this.getStr(change.value, 'media_id') ||
              this.getStr(change.value, 'id');
            if (mediaId) {
              await this.processMedia(mediaId);
            } else {
              this.logger.warn(
                `Feed event has no media_id: ${JSON.stringify(change.value)}`,
              );
            }
            break;
          }

          case 'mentions': {
            this.logger.log('Event type: MENTION');
            const mediaId =
              this.getStr(change.value, 'media_id') ||
              this.getStr(change.value, 'id');
            if (mediaId) {
              await this.processMedia(mediaId);
            } else {
              this.logger.warn(
                `Mention event has no media_id: ${JSON.stringify(change.value)}`,
              );
            }
            break;
          }

          case 'comments': {
            this.logger.log('Event type: COMMENT');
            this.handleComment(change.value);
            break;
          }

          case 'messages': {
            this.logger.log('Event type: DIRECT MESSAGE');
            this.handleMessage(change.value);
            break;
          }

          case 'messaging_seen': {
            this.logger.log('Event type: MESSAGE SEEN (read receipt)');
            this.logger.debug(`Read receipt: ${JSON.stringify(change.value)}`);
            break;
          }

          case 'messaging_postbacks': {
            this.logger.log('Event type: MESSAGING POSTBACK');
            this.logger.debug(`Postback data: ${JSON.stringify(change.value)}`);
            break;
          }

          case 'messaging_referrals': {
            this.logger.log('Event type: MESSAGING REFERRAL');
            this.logger.debug(`Referral data: ${JSON.stringify(change.value)}`);
            break;
          }

          case 'story_insights': {
            this.logger.log('Event type: STORY INSIGHTS');
            this.handleStoryInsight(change.value);
            break;
          }

          case 'live_comments': {
            this.logger.log('Event type: LIVE COMMENT');
            this.logger.debug(`Live comment: ${JSON.stringify(change.value)}`);
            break;
          }

          case 'standby': {
            this.logger.log('Event type: STANDBY');
            this.logger.debug(`Standby data: ${JSON.stringify(change.value)}`);
            break;
          }

          default: {
            this.logger.warn(`Unknown webhook field: "${change.field}"`);
            this.logger.warn(
              `Unknown field payload: ${JSON.stringify(change.value)}`,
            );
            break;
          }
        }
      }
    }

    this.logger.log('Webhook processing complete');
  }

  /**
   * Safely access a nested property and return it as a string.
   * Supports dot-notation paths like "from.username".
   * Returns fallback if the value is null/undefined.
   */
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
    const commentId = this.getStr(value, 'id', 'unknown');
    const text = this.getStr(value, 'text');
    const from =
      this.getStr(value, 'from.username') ||
      this.getStr(value, 'from.id', 'unknown');
    const mediaId = this.getStr(value, 'media.id');

    this.logger.log(
      `Comment | id=${commentId} | from=${from} | text="${text}"`,
    );
    this.logger.debug(`Full comment payload: ${JSON.stringify(value)}`);

    if (mediaId) {
      this.logger.log(`Comment is on media ${mediaId}`);
    }
  }

  private handleMessage(value: Record<string, unknown>): void {
    const senderId =
      this.getStr(value, 'sender.id') ||
      this.getStr(value, 'from.id', 'unknown');
    const messageText =
      this.getStr(value, 'message.text') || this.getStr(value, 'text');
    const messageId =
      this.getStr(value, 'message.mid') || this.getStr(value, 'mid', 'unknown');

    this.logger.log(
      `DM | id=${messageId} | sender=${senderId} | text="${messageText}"`,
    );
    this.logger.debug(`Full message payload: ${JSON.stringify(value)}`);
  }

  private handleStoryInsight(value: Record<string, unknown>): void {
    const mediaId =
      this.getStr(value, 'media_id') || this.getStr(value, 'id', 'unknown');
    const impressions = this.getStr(value, 'impressions', 'N/A');
    const reach = this.getStr(value, 'reach', 'N/A');
    const replies = this.getStr(value, 'replies', 'N/A');

    this.logger.log(
      `Story insight | media=${mediaId} | impressions=${impressions} | reach=${reach} | replies=${replies}`,
    );
    this.logger.debug(`Full story insight payload: ${JSON.stringify(value)}`);
  }

  private async processMedia(mediaId: string): Promise<void> {
    // Idempotency check
    const existing = await this.postRepository.findOne({
      where: { mediaId },
    });
    if (existing) {
      this.logger.log(`Media ${mediaId} already processed. Skipping.`);
      return;
    }

    try {
      // Fetch media details
      const media = await this.fetchMediaDetails(mediaId);

      // Save to DB
      const post = this.postRepository.create({
        mediaId: media.id,
        caption: media.caption,
        mediaUrl: media.media_url,
        createdAt: new Date(media.timestamp),
      });
      await this.postRepository.save(post);
      this.logger.log(`Saved media ${mediaId} to DB`);

      // Emit event
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

      // Mark as forwarded
      post.forwarded = true;
      await this.postRepository.save(post);
      this.logger.log(`Marked media ${mediaId} as forwarded`);
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

  private async processChange(change: any): Promise<void> {
    const changeType = this.commonService.getChangeEventType(change);
    const changeKey = this.commonService.getChangeEventKey(change);
    if (this.commonService.isDuplicateKey(changeKey)) return;
    this.commonService.cleanupProcessedMessages();

    const value = change.value;

    if (change?.field === 'media' && value?.media_id) {
      const mediaId = String(value.media_id);
      const mediaInfo = await this.getInstagramMediaInfo(mediaId);
      const mediaType = String(mediaInfo?.media_type || '').toUpperCase();
      const username = mediaInfo?.username || '';
      const caption = mediaInfo?.caption || '';
      const permalink = mediaInfo?.permalink || '';
      const mediaUrl = mediaInfo?.media_url || mediaInfo?.thumbnail_url || '';

      const isStory = mediaType === 'STORY';
      const topicKey = isStory ? 'story' : 'posts';
      const topicTitle = isStory ? '📖 Stories' : '📸 Posts';
      const title = isStory ? 'Yangi Story (Instagram)' : 'Yangi Post (Instagram)';

      const userLink = username
        ? `<a href="https://instagram.com/${encodeURIComponent(username)}">${this.commonService.escapeHtml(username)}</a>`
        : 'Instagram sahifa';

      let tgMsg = `<b>${title}</b>\nKimdan: ${userLink}`;
      if (caption) tgMsg += `\n\n${this.commonService.escapeHtml(caption)}`;
      if (permalink) tgMsg += `\n\n${permalink}`;

      await this.telegramService.sendToTelegramGroup(tgMsg, topicKey, topicTitle);

      if (mediaUrl) {
        try {
          const { buffer, contentType } = await this.commonService.downloadBuffer(mediaUrl);
          const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
          const isVideo = mediaType === 'VIDEO' || mediaType === 'REELS';
          const method = isVideo ? 'sendVideo' : 'sendPhoto';
          const fieldName = isVideo ? 'video' : 'photo';
          await this.telegramService.sendFileToTelegram(
            method,
            fieldName,
            buffer,
            `media.${ext}`,
            contentType,
            { parse_mode: 'HTML', supports_streaming: true },
            topicKey,
            topicTitle,
          );
        } catch (err) {
          this.logger.error('Media rasm yuborishda xatolik:', err);
        }
      }
      return;
    }

    if (value && value.from) {
      const username = value.from.username;
      const text = value.text || 'Media/Boshqa narsa';

      const userLink = username
        ? `<a href="https://instagram.com/${encodeURIComponent(username)}">${this.commonService.escapeHtml(username)}</a>`
        : `<a href="https://instagram.com/">Foydalanuvchi ID: ${this.commonService.escapeHtml(value.from.id || '')}</a>`;

      const tgMsg = `<b>Yangi bildirishnoma (Instagram)</b>\nKimdan: ${userLink}\n\nXabar: ${this.commonService.escapeHtml(text)}`;
      await this.telegramService.sendToTelegramGroup(tgMsg, changeType, changeType);
      return;
    }

    const genericChangeMsg = `<b>Instagram Event</b>\nTuri: <code>${this.commonService.escapeHtml(changeType)}</code>\n\n<pre>${this.commonService.escapeHtml(JSON.stringify(change, null, 2))}</pre>`;
    await this.telegramService.sendToTelegramGroup(genericChangeMsg, changeType, changeType);
  }

  async sendDirectMessage(username: string, message: string): Promise<any> {
    const url = `https://graph.facebook.com/v16.0/me/messages`;
    const accessToken = this.accessToken;

    if (!accessToken) {
      throw new Error('Instagram access token is not configured');
    }

    try {
      const response = await this.httpService
        .post(
          url,
          {
            recipient: { username },
            message: { text: message },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        )
        .toPromise();

      if (!response) {
        throw new Error('No response received from Instagram API');
      }

      return response.data;
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send Instagram message',
        (error as Error)?.stack,
      );
      throw new Error(
        (error as Error)?.message || 'Failed to send Instagram message',
      );
    }
  }

  async getInstagramMediaInfo(mediaId: string): Promise<any> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
    if (!accessToken) {
      this.logger.warn('INSTAGRAM_ACCESS_TOKEN is missing!');
      return null;
    }

    const fields =
      'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username';
    const urls = [
      `https://graph.facebook.com/v21.0/${mediaId}?fields=${fields}&access_token=${accessToken}`,
      `https://graph.instagram.com/v21.0/${mediaId}?fields=${fields}&access_token=${accessToken}`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        return await response.json();
      } catch (err) {
        this.logger.error('Error fetching media info:', err);
      }
    }

    return null;
  }
}
