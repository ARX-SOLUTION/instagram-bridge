import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { lastValueFrom } from 'rxjs';
import {
  TelegramService,
  TopicRoutingOptions,
} from '../telegram/telegram.service';

interface InstagramUserInfo {
  id?: string;
  name?: string;
  username?: string;
}

interface InstagramMediaInfo {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
}

interface WebhookChangeValueFrom {
  id?: string;
  username?: string;
}

interface WebhookChangeValue {
  from?: WebhookChangeValueFrom;
  text?: string;
  media_id?: string | number;
  comment_id?: string | number;
  id?: string | number;
  target_id?: string | number;
  event_id?: string | number;
  [key: string]: unknown;
}

interface WebhookChange {
  field?: string;
  value?: WebhookChangeValue;
}

interface WebhookAttachmentPayload {
  url?: string;
  link?: string;
  src?: string;
  attachment_url?: string;
  permalink_url?: string;
  title?: string;
  [key: string]: unknown;
}

interface WebhookAttachment {
  type?: string;
  payload?: WebhookAttachmentPayload;
  [key: string]: unknown;
}

interface WebhookMessageBody {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  attachments?: WebhookAttachment[];
  [key: string]: unknown;
}

interface WebhookReactionBody {
  mid?: string;
  action?: string;
  reaction?: string;
  [key: string]: unknown;
}

interface WebhookReadBody {
  watermark?: string | number;
  [key: string]: unknown;
}

interface WebhookDeliveryBody {
  watermark?: string | number;
  [key: string]: unknown;
}

interface WebhookMessaging {
  sender?: { id?: string; username?: string };
  recipient?: { id?: string };
  message?: WebhookMessageBody;
  reaction?: WebhookReactionBody;
  read?: WebhookReadBody;
  delivery?: WebhookDeliveryBody;
  postback?: Record<string, unknown>;
  optin?: Record<string, unknown>;
  referral?: Record<string, unknown>;
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

interface DownloadResult {
  buffer: Buffer;
  contentType: string;
}

interface DmAttachmentContext {
  userLink: string;
  topicRouting: TopicRoutingOptions;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly graphDmUrl = 'https://graph.instagram.com/v21.0/me/messages';
  private readonly processedMessages = new Map<string, number>();

  private readonly processedTtlMs = 10 * 60 * 1000;
  private readonly processedMaxSize = 5000;

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
    private readonly httpService: HttpService,
  ) {}

  validateVerifyToken(token?: string): boolean {
    const verifyToken = this.configService.get<string>(
      'instagram.verifyToken',
      '',
    );
    return !!token && token === verifyToken;
  }

  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    this.logger.log('========== IG EVENT ==========');
    this.logger.log(JSON.stringify(event, null, 2));

    if (!event?.entry || !Array.isArray(event.entry)) {
      const message =
        '<b>Instagram Event</b>\n' +
        'Turi: <code>entry.unknown</code>\n\n' +
        `<pre>${this.escapeHtml(this.shortJson(event))}</pre>`;
      await this.telegramService.sendHtmlMessage(message, {
        topicKey: 'entry.unknown',
        topicTitle: 'entry.unknown',
      });
      return;
    }

    for (const entry of event.entry) {
      await this.processEntry(entry);
    }
  }

  private async processEntry(entry: WebhookEntry): Promise<void> {
    const hasChanges = Array.isArray(entry.changes) && entry.changes.length > 0;
    const hasMessaging =
      Array.isArray(entry.messaging) && entry.messaging.length > 0;

    if (!hasChanges && !hasMessaging) {
      const entryKey = `entry:unknown:${this.hashObject(entry)}`;
      if (this.isDuplicateKey(entryKey)) return;

      this.cleanupProcessedMessages();
      const entryMessage =
        '<b>Instagram Entry Event</b>\n' +
        'Turi: <code>entry.unknown</code>\n\n' +
        `<pre>${this.escapeHtml(this.shortJson(entry))}</pre>`;

      await this.telegramService.sendHtmlMessage(entryMessage, {
        topicKey: 'entry.unknown',
        topicTitle: 'entry.unknown',
      });
      return;
    }

    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        await this.processChange(change);
      }
    }

    if (Array.isArray(entry.messaging)) {
      for (const msg of entry.messaging) {
        await this.processMessagingEvent(msg);
      }
    }
  }

  private async processChange(change: WebhookChange): Promise<void> {
    const changeType = this.getChangeEventType(change);
    const changeKey = this.getChangeEventKey(change);
    if (this.isDuplicateKey(changeKey)) return;
    this.cleanupProcessedMessages();

    const value = change.value;

    if (change.field === 'media' && value?.media_id) {
      await this.processMediaChange(String(value.media_id));
      return;
    }

    if (value?.from) {
      const username = value.from.username;
      const text = this.normalizeText(value.text);
      const userLink = this.createInstagramProfileLink(
        username,
        value.from.id,
        {
          fallbackPrefix: 'Foydalanuvchi ID',
        },
      );

      const message =
        '<b>Yangi bildirishnoma (Instagram)</b>\n' +
        `Kimdan: ${userLink}\n\n` +
        `Xabar: ${this.escapeHtml(text)}`;

      await this.telegramService.sendHtmlMessage(message, {
        topicKey: changeType,
        topicTitle: changeType,
      });
      return;
    }

    const genericChangeMessage =
      '<b>Instagram Event</b>\n' +
      `Turi: <code>${this.escapeHtml(changeType)}</code>\n\n` +
      `<pre>${this.escapeHtml(this.shortJson(change))}</pre>`;

    await this.telegramService.sendHtmlMessage(genericChangeMessage, {
      topicKey: changeType,
      topicTitle: changeType,
    });
  }

  private async processMediaChange(mediaId: string): Promise<void> {
    const mediaInfo = await this.getInstagramMediaInfo(mediaId);
    const mediaType = String(mediaInfo?.media_type ?? '').toUpperCase();
    const username = mediaInfo?.username ?? '';
    const caption = mediaInfo?.caption ?? '';
    const permalink = mediaInfo?.permalink ?? '';
    const mediaUrl = mediaInfo?.media_url ?? mediaInfo?.thumbnail_url ?? '';

    const isStory = mediaType === 'STORY';
    const topicRouting: TopicRoutingOptions = {
      topicKey: isStory ? 'story' : 'posts',
      topicTitle: isStory ? 'Stories' : 'Posts',
    };
    const title = isStory
      ? 'Yangi Story (Instagram)'
      : 'Yangi Post (Instagram)';

    const userLink = username
      ? `<a href="https://instagram.com/${encodeURIComponent(username)}">${this.escapeHtml(username)}</a>`
      : 'Instagram sahifa';

    let text = `<b>${title}</b>\nKimdan: ${userLink}`;
    if (caption) {
      text += `\n\n${this.escapeHtml(caption)}`;
    }
    if (permalink) {
      text += `\n\n${permalink}`;
    }

    await this.telegramService.sendHtmlMessage(text, topicRouting);

    if (!mediaUrl) return;

    try {
      const { buffer, contentType } = await this.downloadBuffer(mediaUrl);
      const extension = this.getExtensionFromContentType(contentType, 'jpg');
      const isVideo = mediaType === 'VIDEO' || mediaType === 'REELS';

      await this.telegramService.sendBufferFile(
        isVideo ? 'sendVideo' : 'sendPhoto',
        isVideo ? 'video' : 'photo',
        buffer,
        `media.${extension}`,
        contentType,
        {
          parseMode: 'HTML',
          supportsStreaming: true,
        },
        topicRouting,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to forward media file: ${err.message}`);
    }
  }

  private async processMessagingEvent(msg: WebhookMessaging): Promise<void> {
    const eventType = this.getMessagingEventType(msg);
    if (
      ['dm.read', 'dm.delivery', 'dm.message_echo', 'dm.other'].includes(
        eventType,
      )
    ) {
      return;
    }

    const eventKey = this.getMessagingEventKey(msg);
    if (this.isDuplicateKey(eventKey)) return;
    this.cleanupProcessedMessages();

    const senderId = msg.sender?.id;
    const myIgId = this.configService.get<string>('instagram.igUserId', '');
    if (!senderId || (myIgId && senderId === myIgId)) return;

    if (eventType === 'dm.message') {
      await this.processDmMessage(msg, senderId, eventType);
      return;
    }

    if (eventType === 'dm.reaction') {
      await this.processDmReaction(msg, senderId, eventType);
      return;
    }

    const genericMessage =
      '<b>Instagram DM Event</b>\n' +
      `Turi: <code>${this.escapeHtml(eventType)}</code>\n` +
      `Kimdan: <code>${this.escapeHtml(senderId)}</code>\n` +
      `Kimga: <code>${this.escapeHtml(msg.recipient?.id ?? '')}</code>\n\n` +
      `<pre>${this.escapeHtml(this.shortJson(msg))}</pre>`;

    await this.telegramService.sendHtmlMessage(genericMessage, {
      topicKey: eventType,
      topicTitle: eventType,
    });
  }

  private async processDmMessage(
    msg: WebhookMessaging,
    senderId: string,
    eventType: string,
  ): Promise<void> {
    const text = this.extractMessageText(msg.message?.text);
    const attachments = Array.isArray(msg.message?.attachments)
      ? msg.message.attachments
      : [];
    const hasText = text.length > 0;
    const hasAttachments = attachments.length > 0;

    if (!hasText && !hasAttachments) return;

    const userInfo = await this.getInstagramUserInfo(senderId);
    const name = userInfo?.name ?? "Noma'lum";
    const username = userInfo?.username ?? '';
    const userLink = this.createInstagramProfileLink(username, senderId, {
      displayName: name,
      fallbackPrefix: 'ID',
    });

    const topicRouting: TopicRoutingOptions = {
      topicKey: eventType,
      topicTitle: eventType,
    };

    if (hasText) {
      const textMessage =
        '<b>Yangi xabar (Instagram DM)</b>\n' +
        `Kimdan: ${userLink}\n\n` +
        `Xabar: ${this.escapeHtml(text)}`;

      await this.telegramService.sendHtmlMessage(textMessage, topicRouting);
    }

    if (hasAttachments) {
      for (const attachment of attachments) {
        await this.sendDmAttachmentToTelegram(attachment, {
          userLink,
          topicRouting,
        });
      }
    }

    const autoReplyText = this.configService.get<string>(
      'instagram.autoReplyText',
      'Salom! Sizga tez orada javob beramiz.',
    );
    await this.autoReplyToInstagramDm(senderId, autoReplyText);
  }

  private async processDmReaction(
    msg: WebhookMessaging,
    senderId: string,
    eventType: string,
  ): Promise<void> {
    const userInfo = await this.getInstagramUserInfo(senderId);
    const username = userInfo?.username ?? senderId;
    const emoji = msg.reaction?.reaction ?? '';

    const message =
      '<b>Instagram DM Reaction</b>\n' +
      `Kimdan: <code>${this.escapeHtml(username)}</code>\n` +
      `Reaksiya: ${this.escapeHtml(emoji)}`;

    await this.telegramService.sendHtmlMessage(message, {
      topicKey: eventType,
      topicTitle: eventType,
    });
  }

  private async sendDmAttachmentToTelegram(
    attachment: WebhookAttachment,
    context: DmAttachmentContext,
  ): Promise<void> {
    const type = String(attachment.type ?? 'file').toLowerCase();
    const url = this.getAttachmentUrl(attachment);
    const caption =
      '<b>Instagram DM</b>\n' +
      `Kimdan: ${context.userLink}\n` +
      `Turi: <code>${this.escapeHtml(type)}</code>`;

    if (type === 'share') {
      const shareUrl =
        attachment.payload?.url ??
        attachment.payload?.link ??
        attachment.payload?.permalink_url ??
        '';
      const title = attachment.payload?.title ?? '';

      const message =
        `${caption}${title ? `\nSarlavha: ${this.escapeHtml(title)}` : ''}` +
        (shareUrl ? `\n\n${this.escapeHtml(shareUrl)}` : '\n\nURL topilmadi');

      await this.telegramService.sendHtmlMessage(message, context.topicRouting);
      return;
    }

    if (!url) {
      const fallbackMessage =
        `${caption}\n\n` +
        '<b>URL topilmadi</b>\n' +
        `<pre>${this.escapeHtml(this.shortJson(attachment))}</pre>`;
      await this.telegramService.sendHtmlMessage(
        fallbackMessage,
        context.topicRouting,
      );
      return;
    }

    try {
      const { buffer, contentType } = await this.downloadBuffer(url);
      const extension = this.getExtensionFromContentType(contentType, 'bin');
      const filename = `file.${extension}`;
      const shortCaption = this.truncateText(caption, 950);

      const methodAndField = this.resolveTelegramMethodByAttachmentType(type);
      let result = await this.telegramService.sendBufferFile(
        methodAndField.method,
        methodAndField.field,
        buffer,
        filename,
        contentType,
        {
          caption: shortCaption,
          parseMode: 'HTML',
          supportsStreaming: true,
        },
        context.topicRouting,
      );

      if (!result.ok && methodAndField.method !== 'sendDocument') {
        result = await this.telegramService.sendBufferFile(
          'sendDocument',
          'document',
          buffer,
          filename,
          contentType,
          {
            caption: shortCaption,
            parseMode: 'HTML',
            supportsStreaming: true,
          },
          context.topicRouting,
        );
      }

      if (result.ok) return;

      throw new Error(result.description ?? 'Attachment send failed');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Attachment forward failed: ${err.message}`);

      const fallbackMessage =
        `${caption}\n\n` +
        "Yuborib bo'lmadi.\n" +
        `URL: ${this.escapeHtml(url)}`;
      await this.telegramService.sendHtmlMessage(
        fallbackMessage,
        context.topicRouting,
      );
    }
  }

  private resolveTelegramMethodByAttachmentType(type: string): {
    method: 'sendPhoto' | 'sendVideo' | 'sendVoice' | 'sendDocument';
    field: 'photo' | 'video' | 'voice' | 'document';
  } {
    if (type === 'image' || type === 'sticker') {
      return { method: 'sendPhoto', field: 'photo' };
    }

    if (type === 'video' || type === 'reel') {
      return { method: 'sendVideo', field: 'video' };
    }

    if (type === 'audio' || type === 'voice_clip') {
      return { method: 'sendVoice', field: 'voice' };
    }

    return { method: 'sendDocument', field: 'document' };
  }

  private async getInstagramUserInfo(
    userId: string,
  ): Promise<InstagramUserInfo | null> {
    const accessToken = this.configService.get<string>(
      'instagram.accessToken',
      '',
    );
    const url =
      `https://graph.instagram.com/v21.0/${encodeURIComponent(userId)}` +
      `?fields=name,username&access_token=${encodeURIComponent(accessToken)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return (await response.json()) as InstagramUserInfo;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to fetch Instagram user info: ${err.message}`);
      return null;
    }
  }

  private async getInstagramMediaInfo(
    mediaId: string,
  ): Promise<InstagramMediaInfo | null> {
    const accessToken = this.configService.get<string>(
      'instagram.accessToken',
      '',
    );
    if (!accessToken) {
      this.logger.warn('INSTAGRAM_ACCESS_TOKEN is empty (media info)');
      return null;
    }

    const fields =
      'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username';
    const encodedMediaId = encodeURIComponent(mediaId);
    const encodedToken = encodeURIComponent(accessToken);

    const urls = [
      `https://graph.facebook.com/v21.0/${encodedMediaId}?fields=${fields}&access_token=${encodedToken}`,
      `https://graph.instagram.com/v21.0/${encodedMediaId}?fields=${fields}&access_token=${encodedToken}`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        return (await response.json()) as InstagramMediaInfo;
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to fetch media info: ${err.message}`);
      }
    }

    return null;
  }

  private async downloadBuffer(url: string): Promise<DownloadResult> {
    const accessToken = this.configService.get<string>(
      'instagram.accessToken',
      '',
    );
    const headers = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType:
        response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  private async autoReplyToInstagramDm(
    senderId: string,
    replyText: string,
  ): Promise<void> {
    const accessToken = this.configService.get<string>(
      'instagram.accessToken',
      '',
    );
    if (!accessToken) {
      this.logger.warn('INSTAGRAM_ACCESS_TOKEN is empty; skipping auto-reply');
      return;
    }

    try {
      await lastValueFrom(
        this.httpService.post(
          this.graphDmUrl,
          {
            recipient: { id: senderId },
            message: { text: replyText },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    } catch (error) {
      const err = error as Error & { response?: { data?: unknown } };
      const responseData = err.response?.data
        ? JSON.stringify(err.response.data)
        : undefined;
      this.logger.error(
        `Instagram DM auto-reply failed: ${err.message}`,
        responseData ?? err.stack,
      );
    }
  }

  private getAttachmentUrl(attachment: WebhookAttachment): string {
    return (
      attachment.payload?.url ??
      attachment.payload?.link ??
      attachment.payload?.src ??
      attachment.payload?.attachment_url ??
      ''
    );
  }

  private getMessagingEventType(msg: WebhookMessaging): string {
    if (msg.message?.is_echo) return 'dm.message_echo';
    if (msg.message) return 'dm.message';
    if (msg.read) return 'dm.read';
    if (msg.reaction) return 'dm.reaction';
    if (msg.delivery) return 'dm.delivery';
    if (msg.postback) return 'dm.postback';
    if (msg.optin) return 'dm.optin';
    if (msg.referral) return 'dm.referral';
    return 'dm.other';
  }

  private getMessagingEventKey(msg: WebhookMessaging): string {
    const type = this.getMessagingEventType(msg);

    if (msg.message?.mid) return `dm:mid:${msg.message.mid}`;
    if (msg.reaction?.mid) {
      return `dm:reaction:${msg.reaction.mid}:${msg.reaction.action ?? ''}`;
    }
    if (msg.read?.watermark) {
      return `dm:read:${msg.sender?.id ?? ''}:${msg.read.watermark}`;
    }
    if (msg.delivery?.watermark) {
      return `dm:delivery:${msg.sender?.id ?? ''}:${msg.delivery.watermark}`;
    }

    return `dm:${type}:${this.hashObject(msg)}`;
  }

  private getChangeEventType(change: WebhookChange): string {
    return `change.${change.field ?? 'unknown'}`;
  }

  private getChangeEventKey(change: WebhookChange): string {
    const field = change.field ?? 'unknown';
    const value = change.value;

    const stableId =
      value?.media_id ??
      value?.comment_id ??
      value?.id ??
      value?.target_id ??
      value?.event_id;

    if (stableId) {
      return `change:${field}:${String(stableId)}`;
    }

    return `change:${field}:${this.hashObject(change)}`;
  }

  private cleanupProcessedMessages(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > this.processedTtlMs) {
        this.processedMessages.delete(key);
      }
    }

    if (this.processedMessages.size > this.processedMaxSize) {
      const keys = this.processedMessages.keys();
      while (
        this.processedMessages.size > Math.floor(this.processedMaxSize * 0.8)
      ) {
        const next = keys.next();
        if (next.done) break;
        this.processedMessages.delete(next.value);
      }
    }
  }

  private isDuplicateKey(key: string): boolean {
    if (this.processedMessages.has(key)) return true;
    this.processedMessages.set(key, Date.now());
    return false;
  }

  private hashObject(value: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex')
      .slice(0, 24);
  }

  private shortJson(value: unknown, max = 2500): string {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
  }

  private truncateText(text: string, max = 900): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
  }

  private normalizeText(text?: string): string {
    if (typeof text !== 'string') return 'Media/Boshqa narsa';
    const normalized = text.trim();
    return normalized.length > 0 ? normalized : 'Media/Boshqa narsa';
  }

  private extractMessageText(text?: string): string {
    if (typeof text !== 'string') return '';
    return text.trim();
  }

  private getExtensionFromContentType(
    contentType: string,
    fallback: string,
  ): string {
    const extension = contentType.split('/')[1]?.split(';')[0];
    return extension && extension.length > 0 ? extension : fallback;
  }

  private createInstagramProfileLink(
    username?: string,
    userId?: string,
    options?: { displayName?: string; fallbackPrefix?: string },
  ): string {
    if (username) {
      const escapedUsername = this.escapeHtml(username);
      const label = options?.displayName
        ? `${this.escapeHtml(options.displayName)} (@${escapedUsername})`
        : escapedUsername;
      return `<a href="https://instagram.com/${encodeURIComponent(username)}">${label}</a>`;
    }

    const prefix = options?.fallbackPrefix ?? 'ID';
    const fallbackLabel = userId
      ? `${prefix}: ${this.escapeHtml(userId)}`
      : `${prefix}: noma'lum`;
    return `<a href="https://instagram.com/">${fallbackLabel}</a>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
