import { of } from 'rxjs';
import { InstagramPublishingService } from './instagram-publishing.service.js';

describe('InstagramPublishingService', () => {
  const config = {
    get: (key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        'instagram.accessToken': 'access-token',
        'instagram.igUserId': '17841420906468205',
        'instagram.apiBaseUrl': 'https://graph.instagram.com',
        'instagram.apiVersion': 'v25.0',
        'instagram.publishEnabled': true,
      };
      return values[key] ?? fallback;
    },
  };

  it('does not contact Meta until a caller explicitly confirms publishing', async () => {
    const postCalls: unknown[][] = [];
    const http = {
      post: (...args: unknown[]) => {
        postCalls.push(args);
        throw new Error('Meta must not be called during preview');
      },
    };
    const service = new InstagramPublishingService(
      config as never,
      http as never,
    );

    await expect(
      service.publishReel({
        videoUrl: 'https://cdn.example.test/reel.mp4',
        caption: 'A safe Reel',
        confirmPublish: false,
      }),
    ).resolves.toMatchObject({ status: 'READY_FOR_REVIEW' });

    expect(postCalls).toHaveLength(0);
  });

  it('creates and publishes a Reel only after explicit confirmation', async () => {
    const postCalls: unknown[][] = [];
    const getCalls: unknown[][] = [];
    const postResponses = [
      of({ data: { id: 'container-1' } }),
      of({ data: { id: 'media-1' } }),
    ];
    const http = {
      post: (...args: unknown[]) => {
        postCalls.push(args);
        return postResponses.shift();
      },
      get: (...args: unknown[]) => {
        getCalls.push(args);
        return of({ data: { status_code: 'FINISHED' } });
      },
    };
    const service = new InstagramPublishingService(
      config as never,
      http as never,
    );

    await expect(
      service.publishReel({
        videoUrl: 'https://cdn.example.test/reel.mp4',
        caption: 'Published Reel',
        shareToFeed: true,
        confirmPublish: true,
      }),
    ).resolves.toEqual({
      status: 'PUBLISHED',
      containerId: 'container-1',
      mediaId: 'media-1',
    });

    expect(postCalls[0][0]).toBe(
      'https://graph.instagram.com/v25.0/17841420906468205/media',
    );
    expect(postCalls[0][1]).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://cdn.example.test/reel.mp4',
      share_to_feed: true,
    });
    expect(getCalls[0][0]).toBe(
      'https://graph.instagram.com/v25.0/container-1',
    );
    expect(postCalls[1][0]).toBe(
      'https://graph.instagram.com/v25.0/17841420906468205/media_publish',
    );
  });

  it('does not publish a container while Meta is still processing it', async () => {
    const postCalls: unknown[][] = [];
    const http = {
      post: (...args: unknown[]) => postCalls.push(args),
      get: () => of({ data: { status_code: 'IN_PROGRESS' } }),
    };
    const service = new InstagramPublishingService(
      config as never,
      http as never,
    );

    await expect(service.completeReel('container-2', true)).resolves.toEqual({
      status: 'PROCESSING',
      containerId: 'container-2',
      containerStatus: 'IN_PROGRESS',
    });

    expect(postCalls).toHaveLength(0);
  });
});
