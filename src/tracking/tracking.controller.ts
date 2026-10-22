import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { TrackingJobResponseDto } from './dto/tracking-job.dto';
import { BulkInfluencerIdsDto } from '../influencers/dto/bulk-status.dto';

@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Get tracking job history and statuses' })
  @ApiResponse({ status: 200, type: [TrackingJobResponseDto] })
  getJobs(): Promise<TrackingJobResponseDto[]> {
    return this.trackingService.getTrackingJobs();
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get tracking job status by ID or influencer ID' })
  @ApiResponse({ status: 200, type: TrackingJobResponseDto })
  getJobById(@Param('id') id: string): Promise<TrackingJobResponseDto> {
    return this.trackingService.getTrackingJobById(id);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({ summary: 'Retry a tracking job' })
  retryJob(@Param('id') id: string) {
    return this.trackingService.retryJob(id);
  }
}

@ApiTags('Influencers')
@Controller('influencers')
export class InfluencerSyncController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('bulk-sync')
  @ApiOperation({ summary: 'Bulk trigger video synchronization for multiple influencers' })
  bulkSync(@Body() dto: BulkInfluencerIdsDto) {
    return this.trackingService.bulkSync(dto.ids);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Trigger manual video synchronization for an influencer' })
  sync(@Param('id') id: string) {
    return this.trackingService.syncInfluencer(id);
  }
}

