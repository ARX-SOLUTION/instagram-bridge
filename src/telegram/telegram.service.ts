import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { retry } from '../common/utils/retry.util.js';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '');
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(text: string): Promise<void> {
    await retry(
      () => this.send('sendMessage', { chat_id: this.chatId, text }),
      3,
      1000,
      this.logger,
    );
  }

  async sendMessageToChat(chatId: string, text: string): Promise<void> {
    await retry(
      () => this.send('sendMessage', { chat_id: chatId, text }),
      3,
      1000,
      this.logger,
    );
  }

  async sendPhoto(photoUrl: string, caption?: string): Promise<void> {
    await retry(
      () =>
        this.send('sendPhoto', {
          chat_id: this.chatId,
          photo: photoUrl,
          caption,
        }),
      3,
      1000,
      this.logger,
    );
  }

  async sendToTelegramGroup(
    messageHtml: string,
    topicKey = '',
    topicTitle = '',
  ): Promise<void> {
    await this.send('sendMessage', {
      chat_id: this.chatId,
      text: messageHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }

  async sendFileToTelegram(
    method: string,
    fieldName: string,
    buffer: Buffer,
    filename: string,
    contentType: string,
    extraPayload: Record<string, any>,
    topicKey: string,
    topicTitle: string,
  ): Promise<void> {
    const formData = new FormData();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    formData.append('chat_id', this.chatId);
    formData.append(fieldName, new Blob([arrayBuffer], { type: contentType }), filename);

    for (const [key, value] of Object.entries(extraPayload)) {
      formData.append(key, value);
    }

    const url = `${this.baseUrl}/${method}`;
    try {
      await lastValueFrom(this.httpService.post(url, formData));
      this.logger.log(`Telegram ${method} successful`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Telegram ${method} failed: ${err.message}`, err.stack);
      throw error;
    }
  }

  private async send(method: string, data: any): Promise<void> {
    const url = `${this.baseUrl}/${method}`;
    try {
      await lastValueFrom(this.httpService.post(url, data));
      this.logger.log(`Telegram ${method} successful`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Telegram ${method} failed: ${err.message}`, err.stack);
      throw error;
    }
  }
}
