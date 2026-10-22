import {
  Controller,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';

@ApiTags('Intelligence')
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('ads/top')
  @ApiOperation({ summary: 'Get Top Winning Ads from TikTok Creative Center (US)' })
  getTopAds(
    @Query('country') country = 'US',
    @Query('period') period?: number,
    @Query('sort') sort = 'for_you',
  ) {
    return this.intelligenceService.getTopAds(
      country,
      period ? Number(period) : 7,
      sort,
    );
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get live Trending Videos in the US from TikTok feed' })
  getTrendingFeed(@Query('country') country = 'US') {
    return this.intelligenceService.getTrendingFeed(country);
  }

  @Get('hashtags/:hashtag')
  @ApiOperation({ summary: 'Get details and metrics for a specific TikTok hashtag' })
  getHashtagDetails(@Param('hashtag') hashtag: string) {
    return this.intelligenceService.getHashtagDetails(hashtag);
  }

  @Get('hashtags/:hashtag/videos')
  @ApiOperation({ summary: 'Get top videos for a specific hashtag' })
  getHashtagVideos(
    @Param('hashtag') hashtag: string,
    @Query('cursor') cursor?: string,
    @Query('country') country = 'US',
  ) {
    return this.intelligenceService.getHashtagVideos(hashtag, cursor, country);
  }

  @Get('search/suggestions')
  @ApiOperation({ summary: 'Get real-time TikTok search auto-suggestions' })
  getSearchSuggestions(
    @Query('query') query: string,
    @Query('country') country = 'US',
  ) {
    return this.intelligenceService.getSearchSuggestions(query || '', country);
  }
}

