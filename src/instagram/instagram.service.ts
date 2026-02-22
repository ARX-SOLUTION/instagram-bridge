import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { InstagramPost } from './entities/instagram-post.entity';
import { MediaReceivedEvent } from './events/media-received.event';

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink: string;
  timestamp: string;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly accessToken: string;
  private readonly verifyToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(InstagramPost)
    private readonly postRepository: Repository<InstagramPost>,
  ) {
    this.accessToken = this.configService.get<string>(
      'INSTAGRAM_ACCESS_TOKEN',
      '',
    );
    this.verifyToken = this.configService.get<string>(
      'INSTAGRAM_VERIFY_TOKEN',
      '',
    );
  }

  validateVerifyToken(token: string): boolean {
    return token === this.verifyToken;
  }

  async processWebhookEvent(event: WebhookEventDto): Promise<void> {
    this.logger.log('Received Instagram Webhook Event');

    for (const entry of event.entry) {
      for (const change of entry.changes) {
        if (change.field === 'mentions' || change.field === 'comments') {
          // We are interested in new posts, usually field is strictly not defined in standard basic display API webhooks but graph API webhooks use specific fields.
          // Assuming we subscribe to 'media' or similar relevant fields.
          // However, the prompt implies receiving "new posts".
          // The structure of the change value contains the media ID.
        }

        // For simplicity and to cover most cases, we just look for an ID in the value
        const mediaId = change.value?.id;

        if (!mediaId) {
          this.logger.warn('No media ID found in webhook change');
          continue;
        }

        await this.processMedia(mediaId);
      }
    }
  }

  private async processMedia(mediaId: string): Promise<void> {
    // Idempotency check
    const existing = await this.postRepository.findOne({ where: { mediaId } });
    if (existing) {
      this.logger.log(`Media ${mediaId} already processed. Skipping.`);
      return;
    }

    try {
      // Fetch media details
      const media = await this.fetchMediaDetails(mediaId);

      // Save to DB
      const post = this.postRepository.create({
        mediaId: media.id,
        caption: media.caption,
        mediaUrl: media.media_url,
        createdAt: new Date(media.timestamp), // or current date if missing
      });
      await this.postRepository.save(post);
      this.logger.log(`Saved media ${mediaId} to DB`);

      // Emit event
      await this.eventEmitter.emitAsync(
        'media.received',
        new MediaReceivedEvent(
          post.mediaId,
          post.caption,
          post.mediaUrl,
          media.media_type,
          media.permalink,
          media.timestamp,
        ),
      );
      this.logger.log(`Emitted media.received event for ${mediaId}`);

      // Mark as forwarded
      post.forwarded = true;
      await this.postRepository.save(post);
      this.logger.log(`Marked media ${mediaId} as forwarded`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error processing media ${mediaId}: ${err.message}`,
        err.stack,
      );
    }
  }

  private async fetchMediaDetails(mediaId: string): Promise<InstagramMedia> {
    const url = `https://graph.instagram.com/${mediaId}`;
    const params = {
      fields: 'id,caption,media_type,media_url,permalink,timestamp',
      access_token: this.accessToken,
    };

    try {
      const response = await lastValueFrom(
        this.httpService.get<InstagramMedia>(url, { params }),
      );
      return response.data;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to fetch media details for ${mediaId}`,
        err.stack,
      );
      throw error;
    }
  }
}
