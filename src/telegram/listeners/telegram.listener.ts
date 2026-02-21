import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TelegramService } from '../telegram.service';
import { MediaReceivedEvent } from '../../instagram/events/media-received.event';

@Injectable()
export class TelegramListener {
  private readonly logger = new Logger(TelegramListener.name);

  constructor(private readonly telegramService: TelegramService) {}

  @OnEvent('media.received', { async: true })
  async handleMediaReceived(event: MediaReceivedEvent) {
    this.logger.log(
      `Handling media.received event for mediaId: ${event.mediaId}`,
    );

    const captionText = event.caption || '';
    const messageText = `${captionText}

${event.permalink}`;

    try {
      if (event.mediaType === 'IMAGE' && event.mediaUrl) {
        await this.telegramService.sendPhoto(event.mediaUrl, captionText);
      } else {
        // For VIDEO or ALBUM, or missing mediaUrl, send link
        await this.telegramService.sendMessage(messageText);
      }
      this.logger.log(
        `Successfully processed event for mediaId: ${event.mediaId}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to process event for mediaId ${event.mediaId}: ${err.message}`,
        err.stack,
      );
      throw error; // Propagate error so emitter knows it failed
    }
  }
}
