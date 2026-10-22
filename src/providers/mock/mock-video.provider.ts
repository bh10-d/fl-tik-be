import { Injectable, Logger } from '@nestjs/common';
import { CreatorVideoProvider } from '../creator-video-provider.interface';
import {
  FetchVideosOptions,
  FetchVideosResult,
  NormalizedVideo,
  ProviderCapabilities,
  ResolvedCreator,
  VideoMetricsResult,
} from '../types/provider.types';

@Injectable()
export class MockVideoProvider implements CreatorVideoProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockVideoProvider.name);

  readonly capabilities: ProviderCapabilities = {
    supportsCreatorResolution: true,
    supportsPagination: true,
    supportsMetrics: true,
    supportsMetricHistory: true,
    requiresUserAuthorization: false,
    rateLimitPerMinute: 600,
  };

  isConfigured(): boolean {
    return true;
  }

  async resolveCreator(username: string): Promise<ResolvedCreator> {
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    return {
      provider: this.name,
      externalUserId: `mock-user-${cleanUsername}`,
      username: cleanUsername,
      displayName: cleanUsername.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      profileUrl: `https://www.tiktok.com/@${cleanUsername}`,
      avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80`,
      followers: 125000,
      likes: 850000,
    };
  }

  async fetchCreatorVideos(
    creatorIdentifier: string,
    options?: FetchVideosOptions,
  ): Promise<FetchVideosResult> {
    const cleanUsername = creatorIdentifier.replace(/^@/, '').trim().toLowerCase();
    const limit = options?.limit || 10;
    const page = options?.cursor ? parseInt(options.cursor, 10) : 1;

    const baseSeed = cleanUsername.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const totalSimulatedVideos = 15;
    const startIndex = (page - 1) * limit;

    const videos: NormalizedVideo[] = [];

    for (let i = startIndex; i < Math.min(startIndex + limit, totalSimulatedVideos); i++) {
      const videoNum = i + 1;
      const daysAgo = i * 2;
      const publishedDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - 3600000);
      const views = (baseSeed * 137 + i * 997) % 500000 + 10000;
      const likes = Math.floor(views * 0.08);
      const comments = Math.floor(likes * 0.05);
      const shares = Math.floor(likes * 0.02);

      videos.push({
        provider: this.name,
        providerVideoId: `mock-vid-${cleanUsername}-${videoNum}`,
        caption: `Reviewing top TikTok Shop finds for @${cleanUsername} part ${videoNum} #tiktokshop #review`,
        videoUrl: `https://www.tiktok.com/@${cleanUsername}/video/7300000000${videoNum}`,
        thumbnailUrl: `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&auto=format&fit=crop&q=80`,
        publishedAt: publishedDate,
        publishedAtSource: 'MOCK_PROVIDER',
        publishedAtVerified: true,
        durationSeconds: 45 + (i % 30),
        views,
        likes,
        comments,
        shares,
        dataSource: 'MOCK_PROVIDER',
        rawMetadata: {
          simulated: true,
          videoIndex: i,
          creator: cleanUsername,
        },
      });
    }

    const hasMore = startIndex + limit < totalSimulatedVideos;
    const nextCursor = hasMore ? (page + 1).toString() : undefined;

    return {
      videos,
      nextCursor,
      hasMore,
      totalFetched: videos.length,
    };
  }

  async refreshVideoMetrics(providerVideoId: string): Promise<VideoMetricsResult> {
    const randomBoost = Math.floor(Math.random() * 500) + 50;
    return {
      providerVideoId,
      views: 50000 + randomBoost * 10,
      likes: 4000 + randomBoost,
      comments: 200 + Math.floor(randomBoost * 0.1),
      shares: 80 + Math.floor(randomBoost * 0.05),
      capturedAt: new Date(),
    };
  }
}

