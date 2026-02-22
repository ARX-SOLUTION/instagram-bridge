import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

interface SendTelegramMessageDto {
  chatId: string;
  message: string;
}

@Controller('instagram/webhook')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  @Post('send-message')
  async sendMessage(@Body() body: SendTelegramMessageDto): Promise<string> {
    const { chatId, message } = body;

    if (!chatId || !message) {
      throw new BadRequestException('chatId and message are required');
    }

    if (!this.configService.get<string>('TELEGRAM_BOT_TOKEN', '')) {
      throw new BadRequestException('Telegram bot token is not configured');
    }

    try {
      await this.telegramService.sendMessageToChat(chatId, message);
      return 'Message sent successfully';
    } catch (error: unknown) {
      this.logger.error(
        'Error sending message to Telegram',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Failed to send message');
    }
  }
}
