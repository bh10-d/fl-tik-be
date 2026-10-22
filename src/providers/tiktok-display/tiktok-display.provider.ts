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
export class TikTokDisplayProvider implements CreatorVideoProvider {
  readonly name = 'TIKTOK_DISPLAY';
  private readonly logger = new Logger(TikTokDisplayProvider.name);

  private readonly clientKey: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly apiBaseUrl = 'https://open.tiktokapis.com/v2';

  readonly capabilities: ProviderCapabilities = {
    supportsCreatorResolution: true,
    supportsPagination: true,
    supportsMetrics: true,
    supportsMetricHistory: false,
    requiresUserAuthorization: true,
    rateLimitPerMinute: 60,
  };

  constructor(private readonly configService: ConfigService) {
    this.clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY') || '';
    this.clientSecret = this.configService.get<string>('TIKTOK_CLIENT_SECRET') || '';
    this.redirectUri = this.configService.get<string>('TIKTOK_REDIRECT_URI') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientKey && this.clientSecret);
  }

  getAuthorizationUrl(state: string): string {
    if (!this.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'TikTok Display API credentials are not configured (TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET missing)',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const scopes = encodeURIComponent('user.info.basic,video.list');
    return `https://www.tiktok.com/v2/auth/authorize/?client_key=${this.clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(
      this.redirectUri,
    )}&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    openId: string;
  }> {
    if (!this.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'TikTok Display API credentials are not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: this.clientKey,
          client_secret: this.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
        }),
      });

      const data = await response.json();
      if (data.error || !data.access_token) {
        throw new Error(data.error_description || data.message || 'Token exchange failed');
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        openId: data.open_id,
      };
    } catch (err: any) {
      this.logger.error(`TikTok token exchange error: ${err.message}`);
      throw new HttpException(
        {
          code: 'TIKTOK_AUTH_FAILED',
          message: `Failed to exchange authorization code: ${err.message}`,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async resolveCreator(username: string, accessToken?: string): Promise<ResolvedCreator> {
    if (!this.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'TikTok Display API is not configured with client credentials',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!accessToken) {
      throw new HttpException(
        {
          code: 'AUTHORIZATION_REQUIRED',
          message:
            'TikTok Display API requires user OAuth authorization token to resolve creator profile. Public third-party lookup is restricted by TikTok terms.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,likes_count`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const json = await response.json();
      if (json.error?.code !== 'ok' && json.error?.code !== 0) {
        throw new Error(json.error?.message || 'Failed to fetch user info');
      }

      const user = json.data?.user || {};
      return {
        provider: this.name,
        externalUserId: user.open_id || user.union_id,
        username: username.replace(/^@/, '').trim(),
        displayName: user.display_name,
        profileUrl: user.profile_deep_link || `https://www.tiktok.com/@${username}`,
        avatarUrl: user.avatar_url,
        followers: user.follower_count,
        likes: user.likes_count,
      };
    } catch (err: any) {
      this.logger.error(`TikTok resolveCreator error: ${err.message}`);
      throw new HttpException(
        {
          code: 'TIKTOK_API_ERROR',
          message: err.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchCreatorVideos(
    creatorIdentifier: string,
    options?: FetchVideosOptions,
  ): Promise<FetchVideosResult> {
    if (!this.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'TikTok Display API is not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!options?.accessToken) {
      throw new HttpException(
        {
          code: 'AUTHORIZATION_REQUIRED',
          message:
            'TikTok Display API video endpoints require creator OAuth user authorization. Arbitrary unauthenticated video scraping is prohibited by TikTok policy.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const bodyPayload: Record<string, any> = {
        max_count: Math.min(options.limit || 20, 20),
      };
      if (options.cursor) {
        bodyPayload.cursor = parseInt(options.cursor, 10);
      }

      const response = await fetch(
        `${this.apiBaseUrl}/video/list/?fields=id,create_time,cover_image_url,share_url,video_description,duration,height,width,title,embed_html,embed_link,like_count,comment_count,share_count,view_count`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        },
      );

      const json = await response.json();
      if (json.error?.code !== 'ok' && json.error?.code !== 0) {
        throw new Error(json.error?.message || 'Video list request failed');
      }

      const listData = json.data || {};
      const rawVideos = listData.videos || [];

      const videos: NormalizedVideo[] = rawVideos.map((v: any) => ({
        provider: this.name,
        providerVideoId: v.id,
        caption: v.title || v.video_description,
        videoUrl: v.share_url || `https://www.tiktok.com/@${creatorIdentifier}/video/${v.id}`,
        thumbnailUrl: v.cover_image_url,
        publishedAt: new Date(v.create_time * 1000),
        publishedAtSource: 'TIKTOK_DISPLAY_API',
        publishedAtVerified: true,
        durationSeconds: v.duration,
        views: v.view_count ?? null,
        likes: v.like_count ?? null,
        comments: v.comment_count ?? null,
        shares: v.share_count ?? null,
        dataSource: 'TIKTOK_DISPLAY_API',
        rawMetadata: {
          embedLink: v.embed_link,
          width: v.width,
          height: v.height,
        },
      }));

      return {
        videos,
        nextCursor: listData.cursor ? String(listData.cursor) : undefined,
        hasMore: Boolean(listData.has_more),
        totalFetched: videos.length,
      };
    } catch (err: any) {
      this.logger.error(`TikTok fetchCreatorVideos error: ${err.message}`);
      throw new HttpException(
        {
          code: 'TIKTOK_API_ERROR',
          message: err.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async refreshVideoMetrics(
    providerVideoId: string,
    accessToken?: string,
  ): Promise<VideoMetricsResult> {
    if (!accessToken) {
      throw new HttpException(
        {
          code: 'AUTHORIZATION_REQUIRED',
          message: 'Access token required to query video metrics on TikTok Display API',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/video/query/?fields=id,like_count,comment_count,share_count,view_count`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filters: {
              video_ids: [providerVideoId],
            },
          }),
        },
      );

      const json = await response.json();
      const video = json.data?.videos?.[0];
      if (!video) {
        throw new Error('Video not found or metrics unavailable');
      }

      return {
        providerVideoId,
        views: video.view_count ?? null,
        likes: video.like_count ?? null,
        comments: video.comment_count ?? null,
        shares: video.share_count ?? null,
        capturedAt: new Date(),
      };
    } catch (err: any) {
      throw new HttpException(
        {
          code: 'TIKTOK_METRICS_ERROR',
          message: err.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}

