import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { WebhookVerifyDto } from './dto/webhook-verify.dto';
import { InstagramService } from './instagram.service';
import { TelegramService } from '../telegram/telegram.service';

interface SendTelegramMessageDto {
  chatId: string;
  message: string;
}

@Controller('instagram/webhook')
export class InstagramController {
  private readonly logger = new Logger(InstagramController.name);

  constructor(private readonly instagramService: InstagramService) {}

  @Get()
  verifyWebhook(@Query() query: WebhookVerifyDto): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      this.instagramService.validateVerifyToken(token)
    ) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    } else {
      this.logger.error('Webhook verification failed');
      throw new BadRequestException('Invalid verify token');
    }
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() event: WebhookEventDto): Promise<string> {
    try {
      await this.instagramService.processWebhookEvent(event);
      return 'EVENT_RECEIVED';
    } catch (error) {
      const err = error as Error;
      this.logger.error('Error processing webhook', err.stack);
      throw error;
    }
  }

  @Post('send-instagram-message')
  async sendMessageToInstagram(
    @Body() body: { username: string; message: string },
  ): Promise<string> {
    const { username, message } = body;

    if (!username || !message) {
      throw new BadRequestException('username and message are required');
    }

    try {
      const response = (await this.instagramService.sendDirectMessage(
        username,
        message,
      )) as { status: number };

      if (response.status === 200) {
        return 'Message sent successfully';
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error: unknown) {
      this.logger.error(
        'Error sending message to Instagram',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Failed to send message');
    }
  }

  private async sendTelegramMessage(
    body: SendTelegramMessageDto,
  ): Promise<string> {
    const { chatId, message } = body;

    if (!chatId || !message) {
      throw new BadRequestException('chatId and message are required');
    }

    if (!this.instagramService.getTelegramBotToken()) {
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
