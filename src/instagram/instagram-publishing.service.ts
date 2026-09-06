import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

export interface ReelPublishRequest {
  videoUrl: string;
  caption?: string;
  coverUrl?: string;
  shareToFeed?: boolean;
  confirmPublish?: boolean;
}

interface GraphContainerResponse {
  id?: string;
}

interface GraphStatusResponse {
  status_code?: string;
  status?: string;
}

interface GraphPublishResponse {
  id?: string;
}

export type ReelPublishResult =
  | { status: 'READY_FOR_REVIEW'; videoUrl?: string; containerId?: string }
  | { status: 'PROCESSING'; containerId: string; containerStatus?: string }
  | { status: 'PUBLISHED'; containerId: string; mediaId: string };

@Injectable()
export class InstagramPublishingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async publishReel(request: ReelPublishRequest): Promise<ReelPublishResult> {
    if (!request.confirmPublish) {
      return { status: 'READY_FOR_REVIEW', videoUrl: request.videoUrl };
    }

    const configuration = this.requirePublishConfiguration();
    const headers = {
      Authorization: `Bearer ${configuration.accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const container = await lastValueFrom(
        this.httpService.post<GraphContainerResponse>(
          this.graphUrl(configuration, `${configuration.igUserId}/media`),
          {
            media_type: 'REELS',
            video_url: request.videoUrl,
            caption: request.caption,
            cover_url: request.coverUrl,
            share_to_feed: request.shareToFeed ?? true,
          },
          { headers },
        ),
      );
      const containerId = container.data.id;
      if (!containerId) {
        throw new BadGatewayException(
          'Meta did not return a media container ID',
        );
      }

      return this.finalizeReel(configuration, containerId);
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Meta Instagram publishing request failed');
    }
  }

  async completeReel(
    containerId: string,
    confirmPublish: boolean,
  ): Promise<ReelPublishResult> {
    if (!confirmPublish) {
      return { status: 'READY_FOR_REVIEW', containerId };
    }

    return this.finalizeReel(this.requirePublishConfiguration(), containerId);
  }

  private async finalizeReel(
    configuration: ReturnType<
      InstagramPublishingService['requirePublishConfiguration']
    >,
    containerId: string,
  ): Promise<ReelPublishResult> {
    const headers = {
      Authorization: `Bearer ${configuration.accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const status = await lastValueFrom(
        this.httpService.get<GraphStatusResponse>(
          this.graphUrl(configuration, containerId),
          { headers, params: { fields: 'status_code,status' } },
        ),
      );
      const containerStatus = status.data.status_code ?? status.data.status;

      if (containerStatus !== 'FINISHED') {
        return { status: 'PROCESSING', containerId, containerStatus };
      }

      const published = await lastValueFrom(
        this.httpService.post<GraphPublishResponse>(
          this.graphUrl(
            configuration,
            `${configuration.igUserId}/media_publish`,
          ),
          { creation_id: containerId },
          { headers },
        ),
      );
      if (!published.data.id) {
        throw new BadGatewayException(
          'Meta did not return a published media ID',
        );
      }

      return {
        status: 'PUBLISHED',
        containerId,
        mediaId: published.data.id,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Meta Instagram publishing request failed');
    }
  }

  private requirePublishConfiguration() {
    const publishEnabled = this.configService.get<boolean>(
      'instagram.publishEnabled',
      false,
    );
    const accessToken = this.configService.get<string>(
      'instagram.accessToken',
      '',
    );
    const igUserId = this.configService.get<string>('instagram.igUserId', '');
    const apiBaseUrl = this.configService.get<string>(
      'instagram.apiBaseUrl',
      'https://graph.instagram.com',
    );
    const apiVersion = this.configService.get<string>(
      'instagram.apiVersion',
      'v25.0',
    );

    if (!publishEnabled || !accessToken || !igUserId) {
      throw new ServiceUnavailableException(
        'Instagram publishing is unavailable',
      );
    }

    return { accessToken, igUserId, apiBaseUrl, apiVersion };
  }

  private graphUrl(
    configuration: {
      apiBaseUrl: string;
      apiVersion: string;
    },
    path: string,
  ): string {
    return `${configuration.apiBaseUrl.replace(/\/$/, '')}/${configuration.apiVersion}/${path}`;
  }
}
