import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatorVideoProvider } from '../../providers/creator-video-provider.interface';
import {
  FetchVideosOptions,
  FetchVideosResult,
  NormalizedVideo,
  ProviderCapabilities,
  ResolvedCreator,
  VideoMetricsResult,
} from '../../providers/types/provider.types';
import { decryptSecret } from '../crypto.util';

export interface CrawlerRuntimeConfig {
  isEnabled: boolean;
  baseUrl: string;
  authType: string;
  headerName?: string;
  apiKey?: string;
  timeoutMs: number;
}

@Injectable()
export class CrawlerApiProvider implements CreatorVideoProvider, OnModuleInit {
  readonly name = 'INTERNAL_CRAWLER';
  private readonly logger = new Logger(CrawlerApiProvider.name);
  private cachedConfig: CrawlerRuntimeConfig | null = null;

  readonly capabilities: ProviderCapabilities = {
    supportsCreatorResolution: true,
    supportsPagination: true,
    supportsMetrics: true,
    supportsMetricHistory: false,
    requiresUserAuthorization: false,
    rateLimitPerMinute: 60,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.refreshRuntimeConfig();
      this.logger.log(
        `Initialized CrawlerApiProvider (baseUrl: ${this.cachedConfig?.baseUrl}, configured: ${this.isConfigured()})`,
      );
    } catch (err: any) {
      this.logger.warn(`Could not preload crawler configuration on startup: ${err.message}`);
    }
  }

  /**
   * Refreshes in-memory runtime configuration cache
   */
  async refreshRuntimeConfig(dbRecord?: any): Promise<CrawlerRuntimeConfig> {
    const dbConfig =
      dbRecord !== undefined
        ? dbRecord
        : await this.prisma.dataSourceConfig
            ?.findUnique({
              where: { provider: 'INTERNAL_CRAWLER' },
            })
            .catch(() => null);

    const envBaseUrl =
      this.configService.get<string>('INTERNAL_CRAWLER_BASE_URL') || 'http://localhost:8000';
    const envApiKey = this.configService.get<string>('INTERNAL_CRAWLER_API_KEY') || '';

    const baseUrl = (dbConfig?.baseUrl || envBaseUrl).trim().replace(/\/+$/, '');
    const isEnabled = dbConfig ? dbConfig.isEnabled : true;
    const authType = dbConfig?.authType || (envApiKey ? 'BEARER' : 'NONE');
    const headerName = dbConfig?.headerName || 'Authorization';
    const apiKey = dbConfig?.encryptedApiKey
      ? decryptSecret(dbConfig.encryptedApiKey)
      : envApiKey;

    const timeoutMs = (dbConfig?.settings as any)?.timeoutMs || 60000;

    this.cachedConfig = {
      isEnabled,
      baseUrl,
      authType,
      headerName,
      apiKey,
      timeoutMs,
    };

    return this.cachedConfig;
  }

  /**
   * Get dynamic connection details from persisted config or fallback to env
   */
  async getRuntimeConfig(): Promise<CrawlerRuntimeConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    return this.refreshRuntimeConfig();
  }

  isConfigured(): boolean {
    const url =
      this.cachedConfig?.baseUrl ||
      this.configService.get<string>('INTERNAL_CRAWLER_BASE_URL') ||
      'http://localhost:8000';
    return Boolean(url && url.trim().length > 0);
  }

  private buildHeaders(config: CrawlerRuntimeConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (!config.apiKey) {
      return headers;
    }

    switch (config.authType) {
      case 'BEARER':
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        break;
      case 'API_KEY':
        headers[config.headerName || 'x-api-key'] = config.apiKey;
        break;
      case 'CUSTOM_HEADER':
        headers[config.headerName || 'X-Crawler-Auth'] = config.apiKey;
        break;
      default:
        headers['x-crawler-auth'] = config.apiKey;
        break;
    }

    return headers;
  }

  /**
   * Safe fetch with bounded timeouts and sanitized error logging
   */
  private async executeRequest<T = any>(
    path: string,
    options: RequestInit = {},
  ): Promise<{ data: T; latencyMs: number; status: number }> {
    const config = await this.getRuntimeConfig();

    if (!config.isEnabled) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message:
            'Internal TikTok Crawler API is currently disabled. Enable it in Data Sources settings.',
          code: 'CRAWLER_API_DISABLED',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!config.baseUrl) {
      throw new HttpException(
        'Internal TikTok Crawler Base URL is not configured.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const targetUrl = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 15000);

    const headers: Record<string, string> = {
      ...this.buildHeaders(config),
      ...((options.headers as Record<string, string>) || {}),
    };

    // Forward proxy settings to crawler if enabled
    const proxyConfig = await this.prisma.proxyConfig
      ?.findUnique({
        where: { id: 'default' },
      })
      .catch(() => null);

    if (proxyConfig && proxyConfig.isEnabled && proxyConfig.host && proxyConfig.port) {
      headers['x-crawler-proxy-enabled'] = 'true';
      headers['x-crawler-proxy-protocol'] = proxyConfig.protocol || 'http';
      headers['x-crawler-proxy-host'] = proxyConfig.host;
      headers['x-crawler-proxy-port'] = String(proxyConfig.port);
      if (proxyConfig.username) {
        headers['x-crawler-proxy-username'] = proxyConfig.username;
      }
      if (proxyConfig.encryptedPassword) {
        const plainPassword = decryptSecret(proxyConfig.encryptedPassword);
        if (plainPassword) {
          headers['x-crawler-proxy-password'] = plainPassword;
        }
      }
      if (proxyConfig.region) {
        headers['x-crawler-proxy-region'] = proxyConfig.region;
      }
    }

    try {
      const response = await fetch(targetUrl, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let parsedMessage = `HTTP error ${response.status}`;
        try {
          const parsed = JSON.parse(errBody);
          parsedMessage = parsed.message || parsed.error || parsedMessage;
        } catch {
          if (errBody) parsedMessage = `${parsedMessage}: ${errBody.slice(0, 200)}`;
        }

        this.logger.warn(`Crawler request failed [${response.status}] to ${path}: ${parsedMessage}`);

        throw new HttpException(
          {
            statusCode: response.status,
            message: parsedMessage,
            latencyMs,
            path,
          },
          response.status >= 400 && response.status < 500
            ? response.status
            : HttpStatus.BAD_GATEWAY,
        );
      }

      const data = (await response.json()) as T;
      return { data, latencyMs, status: response.status };
    } catch (err: any) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (err instanceof HttpException) {
        throw err;
      }

      const isTimeout = err.name === 'AbortError';
      const errorMessage = isTimeout
        ? `Request timed out after ${config.timeoutMs}ms`
        : err.message || 'Network connection failed';

      this.logger.error(`Failed to reach Crawler API at ${config.baseUrl}: ${errorMessage}`);

      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_GATEWAY,
          message: errorMessage,
          isTimeout,
          latencyMs,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Health ping test connection
   */
  async ping(): Promise<{ latencyMs: number; status: number; message: string }> {
    const config = await this.getRuntimeConfig();
    if (!config.baseUrl) {
      throw new HttpException('Base URL not configured', HttpStatus.BAD_REQUEST);
    }

    const res = await this.executeRequest('/health', { method: 'GET' });
    return {
      latencyMs: res.latencyMs,
      status: res.status,
      message: 'Internal Crawler API is reachable and healthy (/health)',
    };
  }

  /**
   * Resolve creator profile metadata
   */
  async resolveCreator(username: string): Promise<ResolvedCreator> {
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    const { data } = await this.executeRequest<any>(
      `/users/profile?user=${encodeURIComponent(cleanUsername)}`,
      { method: 'GET' },
    );

    const record = data.user || data.data || data;

    return {
      provider: this.name,
      externalUserId: String(record.id || record.sec_uid || cleanUsername),
      username: record.username || cleanUsername,
      displayName: record.nickname || record.username || cleanUsername,
      profileUrl: record.link || `https://www.tiktok.com/@${encodeURIComponent(cleanUsername)}`,
      avatarUrl: record.profile_picture || null,
      followers:
        record.stats?.follower_count !== undefined && record.stats?.follower_count !== null
          ? Number(record.stats.follower_count)
          : undefined,
      likes:
        record.stats?.heart_count !== undefined && record.stats?.heart_count !== null
          ? Number(record.stats.heart_count)
          : undefined,
    };
  }

  /**
   * Retrieve creator videos
   */
  async fetchCreatorVideos(
    creatorIdentifier: string,
    options?: FetchVideosOptions,
  ): Promise<FetchVideosResult> {
    const cleanUsername = creatorIdentifier.replace(/^@/, '').trim().toLowerCase();
    const queryParams = new URLSearchParams();
    queryParams.set('user', cleanUsername);
    queryParams.set('sort', 'latest');

    if (options?.cursor) {
      queryParams.set('cursor', options.cursor);
    }

    const { data } = await this.executeRequest<any>(
      `/users/videos?${queryParams.toString()}`,
      { method: 'GET' },
    );

    const rawVideos: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data.videos)
        ? data.videos
        : Array.isArray(data.itemList)
          ? data.itemList
          : Array.isArray(data.data?.videos)
            ? data.data.videos
            : [];

    const normalizedVideos: NormalizedVideo[] = rawVideos.map((item: any) => {
      const videoId = String(item.id || item.video_id || item.videoId || item.aweme_id);

      // Parse publication date accurately
      let publishedAt: Date;
      if (item.created_at) {
        publishedAt = new Date(item.created_at);
      } else if (item.publishedAt) {
        publishedAt = new Date(item.publishedAt);
      } else if (item.createTime || item.create_time) {
        const ts = Number(item.createTime || item.create_time);
        publishedAt = new Date(ts > 10000000000 ? ts : ts * 1000);
      } else {
        publishedAt = new Date();
      }

      const stats = item.stats || {};
      const author = item.author || {};
      const videoObj = item.video || {};

      const rawProducts = item.shop_products || item.shopProducts || [];
      const shopProducts = Array.isArray(rawProducts)
        ? rawProducts
            .filter((p: any) => p && (p.product_id || p.productId))
            .map((p: any) => ({
              isShopProduct: p.is_shop_product ?? true,
              productId: String(p.product_id || p.productId),
              productName: p.product_name || p.productName || 'TikTok Shop Product',
              productUrl:
                p.product_url ||
                p.productUrl ||
                `https://www.tiktok.com/view/product/${p.product_id || p.productId}`,
              productImage: p.product_image || p.productImage || null,
              shopId: p.shop_id || p.shopId ? String(p.shop_id || p.shopId) : undefined,
              shopName: p.shop_name || p.shopName || undefined,
              price: p.price !== undefined && p.price !== null ? Number(p.price) : undefined,
              currency: p.currency || 'USD',
            }))
        : [];

      return {
        provider: this.name,
        providerVideoId: videoId,
        caption: item.description || item.caption || item.title || '',
        videoUrl:
          item.link ||
          `https://www.tiktok.com/@${author.username || cleanUsername}/video/${videoId}`,
        thumbnailUrl: item.cover || videoObj.cover || videoObj.origin_cover || null,
        publishedAt,
        publishedAtSource: 'INTERNAL_CRAWLER_API',
        publishedAtVerified: true,
        durationSeconds:
          videoObj.duration_seconds || item.durationSeconds || item.duration || null,
        views:
          stats.play_count !== undefined && stats.play_count !== null
            ? Number(stats.play_count)
            : item.views !== undefined && item.views !== null
              ? Number(item.views)
              : null,
        likes:
          stats.like_count !== undefined && stats.like_count !== null
            ? Number(stats.like_count)
            : item.likes !== undefined && item.likes !== null
              ? Number(item.likes)
              : null,
        comments:
          stats.comment_count !== undefined && stats.comment_count !== null
            ? Number(stats.comment_count)
            : item.comments !== undefined && item.comments !== null
              ? Number(item.comments)
              : null,
        shares:
          stats.share_count !== undefined && stats.share_count !== null
            ? Number(stats.share_count)
            : item.shares !== undefined && item.shares !== null
              ? Number(item.shares)
              : null,
        dataSource: 'INTERNAL_CRAWLER',
        shopProducts,
        rawMetadata: item,
      };
    });

    return {
      videos: normalizedVideos,
      totalFetched: normalizedVideos.length,
      nextCursor: data.next_cursor || data.nextCursor || data.cursor || undefined,
      hasMore: Boolean(data.has_more ?? data.hasMore ?? (normalizedVideos.length > 0)),
    };
  }

  /**
   * Fetch current metrics for existing videos
   */
  async fetchVideoMetrics(providerVideoIds: string[]): Promise<VideoMetricsResult[]> {
    const results: VideoMetricsResult[] = [];

    for (const id of providerVideoIds) {
      try {
        const { data } = await this.executeRequest<any>(
          `/videos/details?video=${encodeURIComponent(id)}`,
          { method: 'GET' },
        );
        const record = data.data || data;
        const stats = record.stats || {};

        results.push({
          providerVideoId: id,
          views:
            stats.play_count !== undefined && stats.play_count !== null
              ? Number(stats.play_count)
              : null,
          likes:
            stats.like_count !== undefined && stats.like_count !== null
              ? Number(stats.like_count)
              : null,
          comments:
            stats.comment_count !== undefined && stats.comment_count !== null
              ? Number(stats.comment_count)
              : null,
          shares:
            stats.share_count !== undefined && stats.share_count !== null
              ? Number(stats.share_count)
              : null,
          capturedAt: new Date(),
        });
      } catch (err: any) {
        this.logger.warn(`Could not refresh video metrics for ID ${id}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Fetch live viewer comments for a TikTok video using the internal scraper
   */
  async fetchVideoComments(videoUrlOrId: string, cursor?: number): Promise<any> {
    const query = new URLSearchParams();
    query.append('video', videoUrlOrId);
    if (cursor !== undefined) {
      query.append('cursor', String(cursor));
    }

    try {
      const { data } = await this.executeRequest<any>(
        `/videos/comments?${query.toString()}`,
        { method: 'GET' },
      );
      return data;
    } catch (err: any) {
      this.logger.warn(`Could not fetch comments for video ${videoUrlOrId}: ${err.message}`);
      return {
        video_id: videoUrlOrId,
        total_count: 0,
        comment_count: 0,
        comments: [],
        has_more: false,
        error: err.message,
      };
    }
  }

  /**
   * 1. Fetch Top Winning Ads from TikTok Creative Center (US)
   */
  async fetchTopAds(country = 'US', period = 7, sort = 'for_you'): Promise<any> {
    const query = new URLSearchParams();
    query.append('country', country);
    query.append('period', String(period));
    if (sort) query.append('sort', sort);

    const { data } = await this.executeRequest<any>(
      `/ads/top?${query.toString()}`,
      { method: 'GET' },
    );
    return data;
  }

  /**
   * 3. Fetch Trending Video Feed (US)
   */
  async fetchTrendingFeed(country = 'US'): Promise<any> {
    const query = new URLSearchParams();
    if (country) query.append('country', country);

    const { data } = await this.executeRequest<any>(
      `/feed/trending?${query.toString()}`,
      { method: 'GET' },
    );
    return data;
  }

  /**
   * 4. Fetch Hashtag Details and Videos
   */
  async fetchHashtagDetails(hashtag: string): Promise<any> {
    const cleanTag = hashtag.replace(/^#/, '').trim();
    const { data } = await this.executeRequest<any>(
      `/hashtags/details?hashtag=${encodeURIComponent(cleanTag)}`,
      { method: 'GET' },
    );
    return data;
  }

  async fetchHashtagVideos(hashtag: string, cursor?: string, country = 'US'): Promise<any> {
    const cleanTag = hashtag.replace(/^#/, '').trim();
    const query = new URLSearchParams();
    query.append('hashtag', cleanTag);
    if (cursor) query.append('cursor', cursor);
    if (country) query.append('country', country);

    const { data } = await this.executeRequest<any>(
      `/hashtags/videos?${query.toString()}`,
      { method: 'GET' },
    );
    return data;
  }

  /**
   * 5. Fetch Search Keyword Auto-Suggestions
   */
  async fetchSearchSuggestions(queryText: string, country = 'US'): Promise<any> {
    const query = new URLSearchParams();
    query.append('query', queryText.trim());
    if (country) query.append('country', country);

    const { data } = await this.executeRequest<any>(
      `/search/suggestions?${query.toString()}`,
      { method: 'GET' },
    );
    return data;
  }
}
