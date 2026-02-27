import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendTelegramMessageDto } from './dto/send-telegram-message.dto';
import { TelegramService } from './telegram.service';

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

    if (!this.configService.get<string>('telegram.botToken', '')) {
      throw new BadRequestException('Telegram bot token is not configured');
    }

    try {
      const response = await this.telegramService.sendMessageToChat(
        chatId,
        message,
      );

      if (!response.ok) {
        throw new BadRequestException(
          response.description ?? 'Failed to send message',
        );
      }

      return 'Message sent successfully';
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        'Error sending message to Telegram',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Failed to send message');
    }
  }
}
