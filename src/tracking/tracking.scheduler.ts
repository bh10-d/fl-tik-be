import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from './tracking.service';
import { CollectionPolicyService } from '../data-sources/services/collection-policy.service';

@Injectable()
export class TrackingScheduler {
  private readonly logger = new Logger(TrackingScheduler.name);
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingService: TrackingService,
    @Optional() private readonly collectionPolicyService?: CollectionPolicyService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledPolling() {
    if (this.isPolling) {
      this.logger.debug('Previous polling round still active, skipping cycle');
      return;
    }

    // Check Global Collection Kill Switch
    if (this.collectionPolicyService) {
      const isCollectionActive = await this.collectionPolicyService.isCollectionActive();
      if (!isCollectionActive) {
        this.logger.debug('Scheduled polling skipped: collection is halted by global kill switch');
        return;
      }
    }

    this.isPolling = true;

    try {
      const now = new Date();
      const policy = this.collectionPolicyService
        ? await this.collectionPolicyService.getPolicy()
        : null;

      const batchLimit = policy?.maxConcurrentJobs || 3;
      const intervalMinutes = policy?.pollIntervalMinutes || 15;

      // Find influencers due for check
      const dueInfluencers = await this.prisma.influencer.findMany({
        where: {
          trackingStatus: 'ACTIVE',
          OR: [
            { nextScheduledCheckAt: { lte: now } },
            { nextScheduledCheckAt: null },
          ],
        },
        take: batchLimit,
      });

      if (dueInfluencers.length > 0) {
        this.logger.log(`Found ${dueInfluencers.length} influencers due for tracking poll`);

        for (const inf of dueInfluencers) {
          await this.trackingService.enqueueSync(inf.id, 'scheduled-sync');
          // Advance nextScheduledCheckAt based on policy interval (default 15m) + jitter
          const jitterSeconds = Math.floor(Math.random() * 60);
          const delaySeconds = intervalMinutes * 60 + jitterSeconds;
          await this.prisma.influencer.update({
            where: { id: inf.id },
            data: {
              nextScheduledCheckAt: new Date(Date.now() + delaySeconds * 1000),
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in scheduled polling: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }
}


