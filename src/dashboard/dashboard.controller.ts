import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get overview KPI metrics for the platform' })
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Get recent system activity, discovered videos, and job runs' })
  @ApiQuery({ name: 'limit', required: false })
  getRecentActivity(@Query('limit') limit?: number) {
    return this.dashboardService.getRecentActivity(limit ? Number(limit) : 10);
  }

  @Get('publishing-trends')
  @ApiOperation({ summary: 'Get daily publishing vs first-detection counts over time' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  getPublishingTrends(@Query('days') days?: number) {
    return this.dashboardService.getPublishingTrends(days ? Number(days) : 7);
  }

  @Get('most-active-creators')
  @ApiOperation({ summary: 'Get ranked list of most active creators in given timeframe' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  getMostActiveCreators(
    @Query('limit') limit?: number,
    @Query('days') days?: number,
  ) {
    return this.dashboardService.getMostActiveCreators(
      limit ? Number(limit) : 10,
      days ? Number(days) : 30,
    );
  }

  @Get('tracking-health')
  @ApiOperation({ summary: 'Get tracking job health, success rate, and provider statuses' })
  getTrackingHealth() {
    return this.dashboardService.getTrackingHealth();
  }
}

