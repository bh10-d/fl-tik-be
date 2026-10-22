export interface ProviderCapabilities {
  supportsCreatorResolution: boolean;
  supportsPagination: boolean;
  supportsMetrics: boolean;
  supportsMetricHistory: boolean;
  requiresUserAuthorization: boolean;
  rateLimitPerMinute?: number;
}

export interface ResolvedCreator {
  provider: string;
  externalUserId?: string;
  username: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  followers?: number;
  likes?: number;
}

export interface NormalizedShopProduct {
  isShopProduct?: boolean;
  productId: string;
  productName: string;
  productUrl?: string;
  productImage?: string;
  shopId?: string;
  shopName?: string;
  price?: number;
  currency?: string;
}

export interface NormalizedVideo {
  provider: string;
  providerVideoId: string;
  caption?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  publishedAt: Date;
  publishedAtSource: string;
  publishedAtVerified: boolean;
  durationSeconds?: number;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  dataSource: string;
  shopProducts?: NormalizedShopProduct[];
  rawMetadata?: Record<string, any>;
}

export interface FetchVideosOptions {
  cursor?: string;
  limit?: number;
  since?: Date;
  until?: Date;
  accessToken?: string;
}

export interface FetchVideosResult {
  videos: NormalizedVideo[];
  nextCursor?: string;
  hasMore: boolean;
  totalFetched: number;
}

export interface VideoMetricsResult {
  providerVideoId: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  capturedAt: Date;
}

export interface ProviderError {
  provider: string;
  code: string;
  message: string;
  isRetryable: boolean;
  statusCode?: number;
  details?: any;
}

