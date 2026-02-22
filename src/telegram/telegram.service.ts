import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { retry } from '../common/utils/retry.util';

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
