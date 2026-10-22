import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingJobResponseDto } from './dto/tracking-job.dto';
import { TrackingProcessor } from './tracking.processor';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectQueue('tracking-queue') private readonly trackingQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly trackingProcessor: TrackingProcessor,
  ) {}

  /**
   * Enqueue a tracking synchronization job for an influencer
   */
  async enqueueSync(
    influencerId: string,
    jobType: 'initial-sync' | 'scheduled-sync' | 'manual-sync' = 'scheduled-sync',
    providerName?: string,
  ) {
    const job = await this.trackingQueue.add(
      jobType,
      { influencerId, providerName },
      {
        jobId: `sync-${influencerId}-${Date.now()}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    this.logger.log(`Enqueued ${jobType} for influencer ${influencerId} (jobId: ${job.id})`);
    return { enqueued: true, jobId: job.id };
  }

  async syncInfluencer(influencerId: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { id: influencerId },
    });

    if (!influencer) {
      throw new NotFoundException(`Influencer "${influencerId}" not found`);
    }

    try {
      const result = await this.trackingProcessor.executeSync(influencerId);
      return {
        ...result,
        influencerId,
        message: result.message || `Synchronized influencer @${influencer.username}`,
      };
    } catch (err: any) {
      this.logger.warn(
        `Direct sync failed for ${influencer.username}: ${err.message}. Enqueuing to queue...`,
      );
      return this.enqueueSync(influencerId, 'manual-sync');
    }
  }

  async retryJob(jobRunId: string) {
    const jobRun = await this.prisma.trackingJobRun.findUnique({
      where: { id: jobRunId },
      include: { influencer: true },
    });

    if (!jobRun) {
      throw new NotFoundException(`Job run "${jobRunId}" not found`);
    }

    return this.enqueueSync(jobRun.influencerId, 'manual-sync', jobRun.provider);
  }

  /**
   * Retrieve active and recent tracking jobs mapped for the frontend
   */
  async getTrackingJobs(): Promise<TrackingJobResponseDto[]> {
    const influencers = await this.prisma.influencer.findMany({
      include: {
        videos: {
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: { publishedAt: true, firstSeenAt: true },
        },
        trackingJobs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastCheckedAt: 'desc' },
    });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const jobs: TrackingJobResponseDto[] = await Promise.all(
      influencers.map(async (inf) => {
        const lastRun = inf.trackingJobs[0];
        const latestVideo = inf.videos[0];

        const newVideoCount = await this.prisma.video.count({
          where: {
            creatorId: inf.id,
            firstSeenAt: { gte: twentyFourHoursAgo },
          },
        });

        let status: 'completed' | 'running' | 'failed' | 'paused' = 'completed';
        if (inf.trackingStatus === 'PAUSED') {
          status = 'paused';
        } else if (lastRun?.status === 'RUNNING') {
          status = 'running';
        } else if (
          lastRun?.status === 'FAILED' ||
          inf.trackingStatus === 'ERROR' ||
          inf.trackingStatus === 'PROVIDER_UNAVAILABLE'
        ) {
          status = 'failed';
        }

        const nextScheduled =
          inf.nextScheduledCheckAt?.toISOString() ||
          new Date(Date.now() + 3600000).toISOString();

        return {
          id: lastRun?.id || `job-${inf.id}`,
          creatorId: inf.id,
          creatorUsername: inf.username,
          creatorDisplayName: inf.displayName,
          creatorAvatarUrl:
            inf.avatarUrl ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
          lastCheckedAt: inf.lastCheckedAt?.toISOString() || inf.createdAt.toISOString(),
          latestPublishedAt: latestVideo?.publishedAt ? latestVideo.publishedAt.toISOString() : null,
          latestDetectedAt: latestVideo?.firstSeenAt ? latestVideo.firstSeenAt.toISOString() : null,
          newVideoCount,
          status,
          nextScheduledAt: nextScheduled,
          failureReason: inf.lastSyncError || lastRun?.errorMessage || null,
        };
      }),
    );

    return jobs;
  }

  async getTrackingJobById(id: string): Promise<TrackingJobResponseDto> {
    const allJobs = await this.getTrackingJobs();
    const matched = allJobs.find((j) => j.id === id || j.creatorId === id);
    if (!matched) {
      throw new NotFoundException(`Tracking job or creator "${id}" not found`);
    }
    return matched;
  }

  async bulkSync(influencerIds: string[]) {
    const influencers = await this.prisma.influencer.findMany({
      where: { id: { in: influencerIds } },
      select: { id: true, username: true },
    });

    const results = await Promise.all(
      influencers.map((inf) => this.enqueueSync(inf.id, 'manual-sync')),
    );

    return {
      enqueuedCount: results.length,
      message: `Enqueued sync for ${results.length} influencers`,
      jobs: results,
    };
  }
}

