import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfirmPublishDto } from './dto/confirm-publish.dto.js';
import { PublishReelDto } from './dto/publish-reel.dto.js';
import { InstagramPublishGuard } from './guards/instagram-publish.guard.js';
import { InstagramPublishingService } from './instagram-publishing.service.js';

@Controller('instagram/publish')
export class InstagramPublishingController {
  constructor(
    private readonly instagramPublishingService: InstagramPublishingService,
  ) {}

  @Post('reels')
  @HttpCode(200)
  @UseGuards(InstagramPublishGuard)
  publishReel(@Body() request: PublishReelDto) {
    return this.instagramPublishingService.publishReel(request);
  }

  @Post('reels/:containerId/complete')
  @HttpCode(200)
  @UseGuards(InstagramPublishGuard)
  completeReel(
    @Param('containerId') containerId: string,
    @Body() request: ConfirmPublishDto,
  ) {
    return this.instagramPublishingService.completeReel(
      containerId,
      request.confirmPublish,
    );
  }
}
