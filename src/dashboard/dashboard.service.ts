import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async getOverview() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalCreators,
      activeTrackedCreators,
      totalVideosTracked,
      newVideos24h,
      aggregates,
      gmvAggregate,
      activeJobsCount,
    ] = await Promise.all([
      this.prisma.influencer.count(),
      this.prisma.influencer.count({ where: { trackingStatus: 'ACTIVE' } }),
      this.prisma.video.count(),
      this.prisma.video.count({ where: { firstSeenAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.video.aggregate({
        _sum: {
          views: true,
          likes: true,
        },
      }),
      this.prisma.influencerMetricSnapshot.aggregate({
        _sum: {
          gmv: true,
          sales: true,
        },
      }),
      this.prisma.trackingJobRun.count({ where: { status: 'RUNNING' } }),
    ]);

    return {
      totalCreators,
      activeTrackedCreators,
      totalVideosTracked,
      newVideos24h,
      totalViews: aggregates._sum.views ? Number(aggregates._sum.views) : 0,
      totalLikes: aggregates._sum.likes ? Number(aggregates._sum.likes) : 0,
      importedGmv: gmvAggregate._sum.gmv ? Number(gmvAggregate._sum.gmv) : 0,
      importedSales: gmvAggregate._sum.sales ? Number(gmvAggregate._sum.sales) : 0,
      activeJobsCount,
      timestamp: new Date().toISOString(),
    };
  }

  async getRecentActivity(limit = 10) {
    const recentVideos = await this.prisma.video.findMany({
      take: limit,
      orderBy: { firstSeenAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const recentImports = await this.prisma.importBatch.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    const recentJobRuns = await this.prisma.trackingJobRun.findMany({
      take: 10,
      orderBy: { startedAt: 'desc' },
      include: {
        influencer: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    });

    return {
      recentDiscoveredVideos: recentVideos.map((v) => ({
        id: v.id,
        creatorUsername: v.creator.username,
        creatorDisplayName: v.creator.displayName,
        creatorAvatarUrl: v.creator.avatarUrl,
        caption: v.caption,
        videoUrl: v.videoUrl,
        publishedAt: v.publishedAt.toISOString(),
        firstSeenAt: v.firstSeenAt.toISOString(),
        views: v.views ? Number(v.views) : null,
        likes: v.likes ? Number(v.likes) : null,
      })),
      recentImports: recentImports.map((i) => ({
        id: i.id,
        filename: i.filename,
        status: i.status,
        totalRows: i.totalRows,
        insertedRows: i.insertedRows,
        createdAt: i.createdAt.toISOString(),
      })),
      recentJobRuns: recentJobRuns.map((j) => ({
        id: j.id,
        creatorUsername: j.influencer?.username,
        status: j.status,
        videosDiscovered: j.videosDiscovered,
        startedAt: j.startedAt.toISOString(),
        completedAt: j.completedAt?.toISOString() || null,
        error: j.errorMessage,
      })),
    };
  }

  async getPublishingTrends(days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Group videos by date of publishedAt and date of firstSeenAt
    const videos = await this.prisma.video.findMany({
      where: {
        OR: [
          { publishedAt: { gte: startDate } },
          { firstSeenAt: { gte: startDate } },
        ],
      },
      select: {
        publishedAt: true,
        firstSeenAt: true,
      },
    });

    // Bucket by day
    const dayBuckets: Record<string, { date: string; publishedCount: number; detectedCount: number }> = {};

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split('T')[0];
      dayBuckets[dateKey] = {
        date: dateKey,
        publishedCount: 0,
        detectedCount: 0,
      };
    }

    videos.forEach((v) => {
      const pubKey = v.publishedAt.toISOString().split('T')[0];
      if (dayBuckets[pubKey]) {
        dayBuckets[pubKey].publishedCount++;
      }

      const detKey = v.firstSeenAt.toISOString().split('T')[0];
      if (dayBuckets[detKey]) {
        dayBuckets[detKey].detectedCount++;
      }
    });

    return Object.values(dayBuckets);
  }

  async getMostActiveCreators(limit = 10, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const creators = await this.prisma.influencer.findMany({
      include: {
        videos: {
          where: {
            publishedAt: { gte: startDate },
          },
          select: {
            id: true,
            views: true,
            likes: true,
          },
        },
      },
    });

    const ranked = creators
      .map((c) => {
        const videoCount = c.videos.length;
        const totalViews = c.videos.reduce((sum, v) => sum + (v.views ? Number(v.views) : 0), 0);
        const totalLikes = c.videos.reduce((sum, v) => sum + (v.likes ? Number(v.likes) : 0), 0);

        return {
          id: c.id,
          username: c.username,
          displayName: c.displayName,
          avatarUrl: c.avatarUrl,
          followers: c.followers ? Number(c.followers) : null,
          category: c.category,
          videoCountInPeriod: videoCount,
          totalViewsInPeriod: totalViews,
          totalLikesInPeriod: totalLikes,
        };
      })
      .sort((a, b) => b.videoCountInPeriod - a.videoCountInPeriod || b.totalViewsInPeriod - a.totalViewsInPeriod)
      .slice(0, limit);

    return ranked;
  }

  async getTrackingHealth() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalRuns, completedRuns, failedRuns, errors] = await Promise.all([
      this.prisma.trackingJobRun.count({ where: { startedAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.trackingJobRun.count({ where: { status: 'COMPLETED', startedAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.trackingJobRun.count({ where: { status: 'FAILED', startedAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.trackingJobRun.findMany({
        where: { status: 'FAILED', startedAt: { gte: twentyFourHoursAgo } },
        take: 5,
        orderBy: { startedAt: 'desc' },
        select: {
          errorCode: true,
          errorMessage: true,
          startedAt: true,
          influencer: { select: { username: true } },
        },
      }),
    ]);

    const successRate = totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 100;

    const providers = this.providerRegistry.getAllProviders();

    return {
      period: 'last_24_hours',
      totalRuns,
      completedRuns,
      failedRuns,
      successRate: Math.round(successRate * 10) / 10,
      providers,
      recentErrors: errors.map((e) => ({
        username: e.influencer.username,
        code: e.errorCode,
        message: e.errorMessage,
        timestamp: e.startedAt.toISOString(),
      })),
    };
  }
}

