import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
export class ExternalVideoProvider implements CreatorVideoProvider {
  readonly name = 'EXTERNAL';
  private readonly logger = new Logger(ExternalVideoProvider.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number = 8000;
  private readonly maxRetries: number = 2;

  readonly capabilities: ProviderCapabilities = {
    supportsCreatorResolution: true,
    supportsPagination: true,
    supportsMetrics: true,
    supportsMetricHistory: true,
    requiresUserAuthorization: false,
    rateLimitPerMinute: 120,
  };

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('EXTERNAL_PROVIDER_BASE_URL') || '';
    this.apiKey = this.configService.get<string>('EXTERNAL_PROVIDER_API_KEY') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          message:
            'External video data provider is not configured. Set EXTERNAL_PROVIDER_BASE_URL and EXTERNAL_PROVIDER_API_KEY in environment variables.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            ...(options.headers || {}),
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
          this.logger.warn(`External provider rate limit hit, backing off for ${retryAfter}s`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          throw new HttpException(
            {
              code: 'EXTERNAL_PROVIDER_ERROR',
              message: `External provider returned HTTP ${response.status}: ${body}`,
            },
            response.status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
          );
        }

        return response;
      } catch (err: any) {
        lastError = err;
        if (err instanceof HttpException) throw err;
        if (attempt < this.maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }

    throw new HttpException(
      {
        code: 'EXTERNAL_PROVIDER_TIMEOUT',
        message: `Failed after ${this.maxRetries} retries: ${lastError?.message || 'Request timed out'}`,
      },
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  async resolveCreator(username: string): Promise<ResolvedCreator> {
    this.ensureConfigured();
    const cleanUsername = username.replace(/^@/, '').trim();

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/creators/${encodeURIComponent(cleanUsername)}`,
    );
    const json = await response.json();
    const data = json.data || json;

    return {
      provider: this.name,
      externalUserId: data.id || data.userId,
      username: cleanUsername,
      displayName: data.displayName || data.nickname || cleanUsername,
      profileUrl: data.profileUrl || `https://www.tiktok.com/@${cleanUsername}`,
      avatarUrl: data.avatarUrl,
      followers: data.followersCount || data.followers,
      likes: data.likesCount || data.likes,
    };
  }

  async fetchCreatorVideos(
    creatorIdentifier: string,
    options?: FetchVideosOptions,
  ): Promise<FetchVideosResult> {
    this.ensureConfigured();
    const cleanUsername = creatorIdentifier.replace(/^@/, '').trim();

    const queryParams = new URLSearchParams({
      limit: String(options?.limit || 20),
    });
    if (options?.cursor) queryParams.set('cursor', options.cursor);
    if (options?.since) queryParams.set('since', options.since.toISOString());

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/creators/${encodeURIComponent(cleanUsername)}/videos?${queryParams.toString()}`,
    );
    const json = await response.json();
    const rawVideos = json.data?.videos || json.videos || [];

    const videos: NormalizedVideo[] = rawVideos.map((v: any) => ({
      provider: this.name,
      providerVideoId: v.id || v.videoId,
      caption: v.description || v.caption || '',
      videoUrl: v.videoUrl || `https://www.tiktok.com/@${cleanUsername}/video/${v.id || v.videoId}`,
      thumbnailUrl: v.thumbnailUrl || v.coverUrl,
      publishedAt: new Date(v.publishedAt || v.createTime),
      publishedAtSource: 'EXTERNAL_DATA_PROVIDER',
      publishedAtVerified: Boolean(v.publishedAtVerified ?? true),
      durationSeconds: v.duration,
      views: v.views ?? null,
      likes: v.likes ?? null,
      comments: v.comments ?? null,
      shares: v.shares ?? null,
      dataSource: 'EXTERNAL_DATA_PROVIDER',
      rawMetadata: v.rawMetadata || {},
    }));

    return {
      videos,
      nextCursor: json.nextCursor || json.data?.nextCursor,
      hasMore: Boolean(json.hasMore || json.data?.hasMore),
      totalFetched: videos.length,
    };
  }

  async refreshVideoMetrics(providerVideoId: string): Promise<VideoMetricsResult> {
    this.ensureConfigured();

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/videos/${encodeURIComponent(providerVideoId)}/metrics`,
    );
    const json = await response.json();
    const data = json.data || json;

    return {
      providerVideoId,
      views: data.views ?? null,
      likes: data.likes ?? null,
      comments: data.comments ?? null,
      shares: data.shares ?? null,
      capturedAt: new Date(data.capturedAt || Date.now()),
    };
  }
}

