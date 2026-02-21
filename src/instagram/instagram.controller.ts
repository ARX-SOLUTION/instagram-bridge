import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { WebhookVerifyDto } from './dto/webhook-verify.dto';

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
}
