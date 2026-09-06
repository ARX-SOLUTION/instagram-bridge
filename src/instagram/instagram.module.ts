import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InstagramController } from './instagram.controller.js';
import { InstagramPublishingController } from './instagram-publishing.controller.js';
import { InstagramPublishGuard } from './guards/instagram-publish.guard.js';
import { InstagramService } from './instagram.service.js';
import { InstagramPublishingService } from './instagram-publishing.service.js';
import { TelegramModule } from '../telegram/telegram.module.js';

@Module({
  imports: [HttpModule, ConfigModule, TelegramModule],
  controllers: [InstagramController, InstagramPublishingController],
  providers: [
    InstagramService,
    InstagramPublishingService,
    InstagramPublishGuard,
  ],
})
export class InstagramModule {}
