import {
  Controller,
  Get,
  Post,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VideosService } from './videos.service';
import { QueryVideoDto } from './dto/query-video.dto';

@ApiTags('Videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of videos with multi-criteria filtering' })
  findAll(@Query() query: QueryVideoDto) {
    return this.videosService.findAll(query);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recently detected videos across all tracked creators' })
  findRecent(@Query('limit') limit?: number) {
    return this.videosService.findRecent(limit ? Number(limit) : 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video details by ID including creator and product links' })
  findOne(@Param('id') id: string) {
    return this.videosService.findOne(id);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get historical engagement metric snapshots for a video' })
  getMetrics(@Param('id') id: string) {
    return this.videosService.getVideoMetrics(id);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get live viewer comments for a video using internal crawler' })
  getComments(
    @Param('id') id: string,
    @Query('cursor') cursor?: number,
  ) {
    return this.videosService.getVideoComments(
      id,
      cursor !== undefined ? Number(cursor) : undefined,
    );
  }

  @Post(':id/refresh')
  @ApiOperation({ summary: 'Refresh video engagement metrics from the data provider' })
  refresh(@Param('id') id: string) {
    return this.videosService.refreshVideo(id);
  }
}

@ApiTags('Influencers')
@Controller('influencers')
export class InfluencerVideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(':id/videos')
  @ApiOperation({ summary: 'Get videos for a specific influencer' })
  findVideosByInfluencer(@Param('id') influencerId: string, @Query() query: QueryVideoDto) {
    return this.videosService.findByInfluencer(influencerId, query);
  }
}

