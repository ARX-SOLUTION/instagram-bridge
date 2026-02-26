import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { retry } from '../common/utils/retry.util';

type TelegramMethod =
  | 'sendMessage'
  | 'sendPhoto'
  | 'sendVideo'
  | 'sendAudio'
  | 'sendVoice'
  | 'sendDocument'
  | 'createForumTopic';

export interface TopicRoutingOptions {
  topicKey?: string;
  topicTitle?: string;
}

export interface TelegramApiResult {
  ok: boolean;
  result?: Record<string, unknown>;
  description?: string;
}

interface SendFileOptions {
  caption?: string;
  parseMode?: string;
  supportsStreaming?: boolean;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly enableForumTopics: boolean;
  private readonly topicCachePath: string;
  private readonly topicThreadCache = new Map<string, number>();

  private forumAvailable = true;
  private forumFallbackLogged = false;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>(
      'telegram.botToken',
      this.configService.get<string>('TELEGRAM_BOT_TOKEN', ''),
    );
    this.chatId = this.configService.get<string>(
      'telegram.chatId',
      this.configService.get<string>('CHAT_ID', ''),
    );
    this.enableForumTopics = this.configService.get<boolean>(
      'telegram.enableTopics',
      true,
    );

    const rawCachePath = this.configService.get<string>(
      'telegram.topicCachePath',
      '.telegram-topic-cache.json',
    );
    this.topicCachePath = path.isAbsolute(rawCachePath)
      ? rawCachePath
      : path.resolve(process.cwd(), rawCachePath);

    this.readTopicCache();
  }

  async sendMessage(
    text: string,
    routing: TopicRoutingOptions = {},
  ): Promise<void> {
    await this.sendToDefault('sendMessage', { text }, routing);
  }

  async sendHtmlMessage(
    text: string,
    routing: TopicRoutingOptions = {},
  ): Promise<void> {
    await this.sendToDefault(
      'sendMessage',
      {
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
      routing,
    );
  }

  async sendMessageToChat(chatId: string, text: string): Promise<void> {
    if (!this.ensureBotTokenConfigured()) return;

    const response = await this.executeJsonWithRetry('sendMessage', {
      chat_id: chatId,
      text,
    });

    if (!response.ok) {
      this.logger.error(
        `Telegram sendMessage failed: ${response.description ?? 'Unknown error'}`,
      );
    }
  }

  async sendPhoto(
    photoUrl: string,
    caption?: string,
    routing: TopicRoutingOptions = {},
  ): Promise<void> {
    await this.sendToDefault(
      'sendPhoto',
      { photo: photoUrl, caption },
      routing,
    );
  }

aaaaaaaaaaaa  async sendBufferFile(
    method: Extract<
      TelegramMethod,
      'sendPhoto' | 'sendVideo' | 'sendAudio' | 'sendVoice' | 'sendDocument'
    >,
    fileField: 'photo' | 'video' | 'audio' | 'voice' | 'document',
    buffer: Buffer,
    filename: string,
    contentType: string,
    options: SendFileOptions = {},
    routing: TopicRoutingOptions = {},
  ): Promise<TelegramApiResult> {
    if (!this.ensureDefaultChatConfigured()) {
      return {
        ok: false,
        description: 'Telegram default chat is not configured',
      };
    }

    const threadId = await this.getOrCreateTopicThreadId(routing);

    try {
      const result = await retry(
        async () => {
          const form = new FormData();
          form.append('chat_id', this.chatId);

          if (threadId) {
            form.append('message_thread_id', String(threadId));
          }
          if (options.caption) {
            form.append('caption', options.caption);
          }
          if (options.parseMode) {
            form.append('parse_mode', options.parseMode);
          }
          if (options.supportsStreaming) {
            form.append('supports_streaming', 'true');
          }

          const blob = new Blob([new Uint8Array(buffer)], {
            type: contentType || 'application/octet-stream',
          });
          form.append(fileField, blob, filename);

          const response = await this.telegramApiCall(method, form);
          if (!response.ok) {
            throw new Error(
              response.description ??
                `Telegram ${method} failed with unknown error`,
            );
          }

          return response;
        },
        3,
        1000,
        this.logger,
      );

      return result;
    } catch (error) {
      const err = error as Error;
      return { ok: false, description: err.message };
    }
  }

  private async sendToDefault(
    method: Extract<
      TelegramMethod,
      | 'sendMessage'
      | 'sendPhoto'
      | 'sendVideo'
      | 'sendAudio'
      | 'sendVoice'
      | 'sendDocument'
    >,
    payload: Record<string, unknown>,
    routing: TopicRoutingOptions = {},
  ): Promise<TelegramApiResult> {
    if (!this.ensureDefaultChatConfigured()) {
      return {
        ok: false,
        description: 'Telegram default chat is not configured',
      };
    }

    const requestPayload: Record<string, unknown> = {
      chat_id: this.chatId,
      ...payload,
    };

    const threadId = await this.getOrCreateTopicThreadId(routing);
    if (threadId) {
      requestPayload.message_thread_id = threadId;
    }

    const response = await this.executeJsonWithRetry(method, requestPayload);
    if (!response.ok) {
      this.logger.error(
        `Telegram ${method} failed: ${response.description ?? 'Unknown error'}`,
      );
    }

    return response;
  }

  private async executeJsonWithRetry(
    method: TelegramMethod,
    payload: Record<string, unknown>,
  ): Promise<TelegramApiResult> {
    try {
      const result = await retry(
        async () => {
          const response = await this.telegramApiCall(method, payload);
          if (!response.ok) {
            throw new Error(
              response.description ??
                `Telegram ${method} failed with unknown error`,
            );
          }
          return response;
        },
        3,
        1000,
        this.logger,
      );

      return result;
    } catch (error) {
      const err = error as Error;
      return { ok: false, description: err.message };
    }
  }

  private async telegramApiCall(
    method: TelegramMethod,
    payload: Record<string, unknown> | FormData,
  ): Promise<TelegramApiResult> {
    if (!this.ensureBotTokenConfigured()) {
      return { ok: false, description: 'TELEGRAM_BOT_TOKEN is empty' };
    }

    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;
    const isFormDataPayload = payload instanceof FormData;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: isFormDataPayload
          ? undefined
          : { 'Content-Type': 'application/json' },
        body: isFormDataPayload ? payload : JSON.stringify(payload),
      });

      const raw = await response.text();
      let body: {
        ok?: boolean;
        result?: unknown;
        description?: string;
      } | null = null;
      try {
        body = JSON.parse(raw) as {
          ok?: boolean;
          result?: unknown;
          description?: string;
        };
      } catch {
        body = null;
      }

      if (!response.ok || !body?.ok) {
        return {
          ok: false,
          description:
            body?.description ?? raw ?? `Telegram API HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        result:
          body.result && typeof body.result === 'object'
            ? (body.result as Record<string, unknown>)
            : undefined,
      };
    } catch (error) {
      const err = error as Error;
      return { ok: false, description: err.message };
    }
  }

  private ensureDefaultChatConfigured(): boolean {
    if (!this.ensureBotTokenConfigured()) return false;

    if (!this.chatId) {
      this.logger.warn('CHAT_ID is empty; skipping Telegram send');
      return false;
    }

    return true;
  }

  private ensureBotTokenConfigured(): boolean {
    if (this.botToken) return true;

    this.logger.warn('TELEGRAM_BOT_TOKEN is empty; skipping Telegram send');
    return false;
  }

  private readTopicCache(): void {
    try {
      if (!fs.existsSync(this.topicCachePath)) return;

      const raw = fs.readFileSync(this.topicCachePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const [key, value] of Object.entries(parsed || {})) {
        const threadId = Number(value);
        if (Number.isInteger(threadId) && threadId > 0) {
          this.topicThreadCache.set(key, threadId);
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to read topic cache: ${err.message}`);
    }
  }

  private writeTopicCache(): void {
    try {
      const data = Object.fromEntries(this.topicThreadCache.entries());
      fs.writeFileSync(
        this.topicCachePath,
        JSON.stringify(data, null, 2),
        'utf8',
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to write topic cache: ${err.message}`);
    }
  }

  private toTopicTitle(eventType: string): string {
    const title = `IG | ${eventType}`;
    return title.length > 120 ? title.slice(0, 120) : title;
  }

  private async getOrCreateTopicThreadId(
    routing: TopicRoutingOptions,
  ): Promise<number | null> {
    const topicKey = routing.topicKey?.trim();
    if (!this.enableForumTopics || !this.forumAvailable || !topicKey) {
      return null;
    }

    if (this.topicThreadCache.has(topicKey)) {
      const cached = this.topicThreadCache.get(topicKey);
      return cached || null;
    }

    const response = await this.executeJsonWithRetry('createForumTopic', {
      chat_id: this.chatId,
      name: this.toTopicTitle(routing.topicTitle ?? topicKey),
    });

    const threadId = Number(response.result?.message_thread_id);
    if (response.ok && Number.isInteger(threadId) && threadId > 0) {
      this.topicThreadCache.set(topicKey, threadId);
      this.writeTopicCache();
      return threadId;
    }

    const description = String(response.description ?? '').toLowerCase();
    if (
      description.includes('not a forum') ||
      description.includes('chat is not a forum') ||
      description.includes('not enough rights') ||
      description.includes('topic_deleted')
    ) {
      this.forumAvailable = false;
      if (!this.forumFallbackLogged) {
        this.forumFallbackLogged = true;
        this.logger.warn(
          'Telegram topics are unavailable. Falling back to default chat mode.',
        );
      }
      this.topicThreadCache.set(topicKey, 0);
      return null;
    }

    this.logger.error(
      `Failed to create topic (${topicKey}): ${response.description ?? 'Unknown error'}`,
    );
    this.topicThreadCache.set(topicKey, 0);
    return null;
  }
}
