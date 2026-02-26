import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { WebhookVerifyDto } from './dto/webhook-verify.dto';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { InstagramService } from './instagram.service';

@Controller('instagram/webhook')
@UseGuards(MetaSignatureGuard)
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
      this.logger.log('Webhook verified');
      return challenge;
    }

    throw new BadRequestException('Invalid verify token');
  }

  @Post()
  @HttpCode(200)
  handleWebhook(@Body() event: WebhookEventDto): string {
    void this.instagramService.processWebhookEvent(event).catch((error) => {
      const err = error as Error;
      this.logger.error('Error processing webhook', err.stack);
    });

    return 'EVENT_RECEIVED';
  }
}
