import { Injectable, Logger } from '@nestjs/common';
import { CrawlerApiProvider } from '../data-sources/providers/crawler-api.provider';

@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(private readonly crawlerProvider: CrawlerApiProvider) {}

  /**
   * 1. Top Winning Ads US
   */
  async getTopAds(country = 'US', period = 7, sort = 'for_you') {
    return this.crawlerProvider.fetchTopAds(country, period, sort);
  }

  /**
   * 3. Live Trending US Feed
   */
  async getTrendingFeed(country = 'US') {
    return this.crawlerProvider.fetchTrendingFeed(country);
  }

  /**
   * 4. Hashtag Tracker & Top Videos
   */
  async getHashtagDetails(hashtag: string) {
    return this.crawlerProvider.fetchHashtagDetails(hashtag);
  }

  async getHashtagVideos(hashtag: string, cursor?: string, country = 'US') {
    return this.crawlerProvider.fetchHashtagVideos(hashtag, cursor, country);
  }

  /**
   * 5. Search Keyword Auto-Suggestions
   */
  async getSearchSuggestions(query: string, country = 'US') {
    if (!query || query.trim().length === 0) {
      return { query: '', suggestion_count: 0, suggestions: [] };
    }
    return this.crawlerProvider.fetchSearchSuggestions(query, country);
  }
}

