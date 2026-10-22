import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCollectionPolicyDto } from '../dto/data-source.dto';

export type CollectionOutcome =
  | 'SUCCESS'
  | 'NO_NEW_VIDEOS'
  | 'FAILED'
  | 'BLOCKED'
  | 'NOT_CHECKED'
  | 'DISABLED';

@Injectable()
export class CollectionPolicyService {
  private readonly logger = new Logger(CollectionPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current collection policy, initializing defaults if not yet created.
   */
  async getPolicy() {
    let policy = await this.prisma.collectionPolicy.findUnique({
      where: { id: 'default' },
    });

    if (!policy) {
      policy = await this.prisma.collectionPolicy.create({
        data: {
          id: 'default',
          activeProvider: 'INTERNAL_CRAWLER',
          isCollectionActive: true,
          pollIntervalMinutes: 15,
          maxConcurrentJobs: 3,
        },
      });
    }

    return policy;
  }

  /**
   * Check if global collection is active (Kill Switch check)
   */
  async isCollectionActive(): Promise<boolean> {
    const policy = await this.getPolicy();
    return policy.isCollectionActive;
  }

  /**
   * Get the active collection provider
   */
  async getActiveProvider(): Promise<string> {
    const policy = await this.getPolicy();
    return policy.activeProvider;
  }

  /**
   * Update collection policy settings
   */
  async updatePolicy(dto: UpdateCollectionPolicyDto) {
    const current = await this.getPolicy();

    const updated = await this.prisma.collectionPolicy.update({
      where: { id: 'default' },
      data: {
        activeProvider: dto.activeProvider || current.activeProvider,
        isCollectionActive:
          dto.isCollectionActive !== undefined
            ? dto.isCollectionActive
            : current.isCollectionActive,
        pollIntervalMinutes: dto.pollIntervalMinutes || current.pollIntervalMinutes,
        maxConcurrentJobs: dto.maxConcurrentJobs || current.maxConcurrentJobs,
      },
    });

    this.logger.log(
      `Collection policy updated: activeProvider=${updated.activeProvider}, active=${updated.isCollectionActive}, interval=${updated.pollIntervalMinutes}m`,
    );

    return updated;
  }

  /**
   * Activate global collection kill switch (stops all collection jobs)
   */
  async stopCollection(reason?: string) {
    const updated = await this.prisma.collectionPolicy.update({
      where: { id: 'default' },
      data: {
        isCollectionActive: false,
        lastError: reason || 'Collection manually stopped via global kill switch',
      },
    });
    this.logger.warn(`GLOBAL KILL SWITCH ENGAGED: Collection stopped (${reason || 'user request'})`);
    return updated;
  }

  /**
   * Resume background collection
   */
  async startCollection() {
    const updated = await this.prisma.collectionPolicy.update({
      where: { id: 'default' },
      data: {
        isCollectionActive: true,
        lastError: null,
      },
    });
    this.logger.log('Global collection resumed');
    return updated;
  }

  /**
   * Record outcome of a collection attempt
   */
  async recordCollectionAttempt(
    provider: string,
    outcome: CollectionOutcome,
    error?: string,
  ) {
    const now = new Date();
    const isSuccess = outcome === 'SUCCESS' || outcome === 'NO_NEW_VIDEOS';

    const policy = await this.getPolicy();

    const recentFailureCount = isSuccess ? 0 : policy.recentFailureCount + 1;

    await this.prisma.collectionPolicy.update({
      where: { id: 'default' },
      data: {
        lastCollectionAttemptAt: now,
        lastSuccessfulCollectionAt: isSuccess ? now : policy.lastSuccessfulCollectionAt,
        recentFailureCount,
        lastError: error || (isSuccess ? null : `Collection ended with outcome: ${outcome}`),
      },
    });

    // Also update data source stats
    await this.prisma.dataSourceConfig
      .update({
        where: { provider },
        data: {
          totalRequests: { increment: 1 },
          successfulRequests: isSuccess ? { increment: 1 } : undefined,
          failedRequests: !isSuccess ? { increment: 1 } : undefined,
          lastSuccessfulRequestAt: isSuccess ? now : undefined,
          lastFailedRequestAt: !isSuccess ? now : undefined,
          lastError: error || null,
          status: isSuccess ? 'HEALTHY' : outcome === 'BLOCKED' ? 'DEGRADED' : 'OFFLINE',
        },
      })
      .catch(() => {});
  }
}

