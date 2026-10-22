import {
  FetchVideosOptions,
  FetchVideosResult,
  NormalizedVideo,
  ProviderCapabilities,
  ResolvedCreator,
  VideoMetricsResult,
} from './types/provider.types';

export const CREATOR_VIDEO_PROVIDERS = 'CREATOR_VIDEO_PROVIDERS';

export interface CreatorVideoProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * Whether this provider has required credentials / configuration active.
   */
  isConfigured(): boolean;

  /**
   * Resolve a creator account by username or identifier.
   */
  resolveCreator(username: string, accessToken?: string): Promise<ResolvedCreator>;

  /**
   * Retrieve available public/authorized video metadata for a creator.
   */
  fetchCreatorVideos(
    creatorIdentifier: string,
    options?: FetchVideosOptions,
  ): Promise<FetchVideosResult>;

  /**
   * Refresh metrics for a specific video if supported.
   */
  refreshVideoMetrics?(
    providerVideoId: string,
    accessToken?: string,
  ): Promise<VideoMetricsResult>;
}

