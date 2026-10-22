import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { CollectionPolicyService } from '../data-sources/services/collection-policy.service';

@Processor('tracking-queue')
export class TrackingProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(TrackingProcessor.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    @Optional() @InjectQueue('tracking-queue') private readonly trackingQueue?: Queue,
    @Optional() private readonly collectionPolicyService?: CollectionPolicyService,
  ) {
    super();
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.configService.get<number>('REDIS_PORT', 6379)),
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => {});
  }

  async process(job: Job<any>): Promise<any> {
    return this.executeSync(job.data.influencerId, job.data.providerName);
  }

  /**
   * Main sync workflow for an influencer
   */
  async executeSync(
    influencerId: string,
    providerName?: string,
  ): Promise<any> {
    const lockKey = `lock:sync:influencer:${influencerId}`;

    // Check Global Collection Kill Switch before doing any work
    if (this.collectionPolicyService) {
      const isCollectionActive = await this.collectionPolicyService.isCollectionActive();
      if (!isCollectionActive) {
        this.logger.warn(
          `Skipping sync job for influencer ${influencerId}: collection halted by global kill switch`,
        );
        return { skipped: true, reason: 'GLOBAL_KILL_SWITCH_ACTIVE' };
      }
    }

    const influencer = await this.prisma.influencer.findUnique({
      where: { id: influencerId },
    });

    if (!influencer) {
      this.logger.warn(`Influencer ${influencerId} not found in database, skipping sync job`);
      return { skipped: true, reason: 'INFLUENCER_NOT_FOUND' };
    }

    // Acquire distributed lock for 60 seconds
    const acquired = await this.redis.set(lockKey, 'locked', 'EX', 60, 'NX');
    if (!acquired) {
      this.logger.warn(
        `Skipping job for influencer @${influencer.username}: another sync is currently running`,
      );
      return { skipped: true, reason: 'LOCKED' };
    }

    // Resolve active provider from collection policy if not explicitly passed
    let targetProviderName = providerName;
    if (!targetProviderName && this.collectionPolicyService) {
      targetProviderName = await this.collectionPolicyService.getActiveProvider();
    }

    const jobRun = await this.prisma.trackingJobRun.create({
      data: {
        influencerId: influencer.id,
        provider: targetProviderName || 'INTERNAL_CRAWLER',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    let provider: any = null;

    try {
      if (influencer.trackingStatus === 'PAUSED') {
        this.logger.log(`Influencer @${influencer.username} is paused, skipping`);
        await this.prisma.trackingJobRun.update({
          where: { id: jobRun.id },
          data: { status: 'PAUSED', completedAt: new Date() },
        });
        return { status: 'PAUSED' };
      }

      provider = this.providerRegistry.getProvider(targetProviderName);

      if (!provider.isConfigured()) {
        await this.prisma.influencer.update({
          where: { id: influencer.id },
          data: {
            trackingStatus: 'PROVIDER_UNAVAILABLE',
            lastSyncError: `Provider ${provider.name} is not configured`,
            lastCheckedAt: new Date(),
          },
        });
        throw new Error(`Provider ${provider.name} is not configured`);
      }

      let discoveredCount = 0;
      let updatedCount = 0;

      // Update creator profile metadata if provider supports it
      if (provider.resolveCreator) {
        try {
          const resolved = await provider.resolveCreator(influencer.username);
          if (resolved) {
            await this.prisma.influencer.update({
              where: { id: influencer.id },
              data: {
                displayName: resolved.displayName || influencer.displayName,
                avatarUrl: resolved.avatarUrl || influencer.avatarUrl,
              },
            });
          }
        } catch (resolveErr: any) {
          this.logger.warn(
            `Could not resolve creator profile for @${influencer.username}: ${resolveErr.message}`,
          );
        }
      }

      // Fetch creator videos using configured provider (Internal Crawler, TikTok Display, or Mock)
      const fetchResult = await provider.fetchCreatorVideos(influencer.username, {
        limit: 30,
      });

      for (const item of fetchResult.videos) {
        const existingVideo = await this.prisma.video.findUnique({
          where: {
            provider_providerVideoId: {
              provider: item.provider,
              providerVideoId: item.providerVideoId,
            },
          },
        });

        let targetVideoId: string;

        if (existingVideo) {
          const updated = await this.prisma.video.update({
            where: { id: existingVideo.id },
            data: {
              lastSeenAt: new Date(),
              views:
                item.views !== null && item.views !== undefined
                  ? BigInt(item.views)
                  : existingVideo.views,
              likes:
                item.likes !== null && item.likes !== undefined
                  ? BigInt(item.likes)
                  : existingVideo.likes,
              comments:
                item.comments !== null && item.comments !== undefined
                  ? BigInt(item.comments)
                  : existingVideo.comments,
              shares:
                item.shares !== null && item.shares !== undefined
                  ? BigInt(item.shares)
                  : existingVideo.shares,
              caption: item.caption || existingVideo.caption,
              videoUrl: item.videoUrl || existingVideo.videoUrl,
              thumbnailUrl: item.thumbnailUrl || existingVideo.thumbnailUrl,
              rawMetadata: (item.rawMetadata || existingVideo.rawMetadata) as any,
            },
          });
          targetVideoId = updated.id;
          updatedCount++;

          if (item.views !== null || item.likes !== null) {
            await this.prisma.videoMetricSnapshot.create({
              data: {
                videoId: updated.id,
                views: updated.views,
                likes: updated.likes,
                comments: updated.comments,
                shares: updated.shares,
                source: item.provider,
              },
            });
          }
        } else {
          const now = new Date();
          const createdVideo = await this.prisma.video.create({
            data: {
              provider: item.provider,
              providerVideoId: item.providerVideoId,
              creatorId: influencer.id,
              caption: item.caption,
              videoUrl: item.videoUrl,
              thumbnailUrl: item.thumbnailUrl,
              publishedAt: item.publishedAt,
              publishedAtSource: item.publishedAtSource,
              publishedAtVerified: item.publishedAtVerified,
              firstSeenAt: now,
              lastSeenAt: now,
              durationSeconds: item.durationSeconds,
              views:
                item.views !== null && item.views !== undefined ? BigInt(item.views) : null,
              likes:
                item.likes !== null && item.likes !== undefined ? BigInt(item.likes) : null,
              comments:
                item.comments !== null && item.comments !== undefined
                  ? BigInt(item.comments)
                  : null,
              shares:
                item.shares !== null && item.shares !== undefined ? BigInt(item.shares) : null,
              dataSource: item.dataSource,
              rawMetadata: item.rawMetadata as any,
            },
          });
          targetVideoId = createdVideo.id;
          discoveredCount++;

          if (item.views !== null || item.likes !== null) {
            await this.prisma.videoMetricSnapshot.create({
              data: {
                videoId: createdVideo.id,
                views: createdVideo.views,
                likes: createdVideo.likes,
                comments: createdVideo.comments,
                shares: createdVideo.shares,
                source: item.provider,
              },
            });
          }

          this.eventEmitter.emit('video.discovered', {
            videoId: createdVideo.id,
            influencerId: influencer.id,
            username: influencer.username,
            publishedAt: createdVideo.publishedAt,
            firstSeenAt: createdVideo.firstSeenAt,
          });
        }

        // Bóc tách và liên kết giỏ hàng TikTok Shop với video
        const productsToProcess =
          item.shopProducts || (item.rawMetadata as any)?.shop_products || [];
        await this.processShopProducts(targetVideoId, productsToProcess);
      }

      const pollIntervalSeconds = Number(
        this.configService.get<number>('TRACKING_POLL_INTERVAL_SECONDS', 900), // Default 15m (900s)
      );
      const nextScheduledCheckAt = new Date(Date.now() + pollIntervalSeconds * 1000);

      await this.prisma.influencer.update({
        where: { id: influencer.id },
        data: {
          lastCheckedAt: new Date(),
          lastSuccessfulSyncAt: new Date(),
          nextScheduledCheckAt,
          lastSyncError: null,
          trackingStatus:
            influencer.trackingStatus === 'ERROR' ||
            influencer.trackingStatus === 'PROVIDER_UNAVAILABLE'
              ? 'ACTIVE'
              : influencer.trackingStatus,
        },
      });

      await this.prisma.trackingJobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          videosDiscovered: discoveredCount,
        },
      });

      if (this.collectionPolicyService && provider) {
        await this.collectionPolicyService
          .recordCollectionAttempt(
            provider.name,
            discoveredCount > 0 ? 'SUCCESS' : 'NO_NEW_VIDEOS',
          )
          .catch(() => {});
      }

      this.logger.log(
        `Tracking complete for @${influencer.username}: discovered ${discoveredCount} new, updated ${updatedCount} existing`,
      );

      return {
        success: true,
        discovered: discoveredCount,
        updated: updatedCount,
        message: `Sync complete: ${discoveredCount} new videos discovered, ${updatedCount} updated`,
      };
    } catch (err: any) {
      this.logger.error(`Tracking failed for influencer ${influencerId}: ${err.message}`);

      if (this.collectionPolicyService) {
        await this.collectionPolicyService
          .recordCollectionAttempt(
            provider?.name || 'UNKNOWN',
            'FAILED',
            err.message,
          )
          .catch(() => {});
      }

      await this.prisma.influencer
        .update({
          where: { id: influencerId },
          data: {
            lastCheckedAt: new Date(),
            lastSyncError: err.message,
            trackingStatus: err.message.includes('not configured')
              ? 'PROVIDER_UNAVAILABLE'
              : 'ERROR',
          },
        })
        .catch(() => {});

      await this.prisma.trackingJobRun
        .update({
          where: { id: jobRun.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: err.message,
            errorCode: err.code || 'SYNC_ERROR',
          },
        })
        .catch(() => {});

      throw err;
    } finally {
      // Release distributed lock
      await this.redis.del(lockKey).catch(() => {});
    }
  }

  /**
   * Upsert shops, products, and link video-product associations
   */
  private async processShopProducts(videoId: string, shopProducts?: any[]) {
    if (!shopProducts || !Array.isArray(shopProducts) || shopProducts.length === 0) {
      return;
    }

    for (const p of shopProducts) {
      const productId = p.productId || p.product_id;
      if (!productId) continue;

      try {
        let shopIdInDb: string | undefined = undefined;
        const shopId = p.shopId || p.shop_id;
        const shopName = p.shopName || p.shop_name;

        // 1. Lưu / Cập nhật Shop
        if (shopId) {
          const shop = await this.prisma.shop.upsert({
            where: { externalShopId: String(shopId) },
            update: {
              ...(shopName ? { name: shopName } : {}),
              market: 'US',
            },
            create: {
              name: shopName || 'TikTok Shop Seller',
              externalShopId: String(shopId),
              market: 'US',
              source: 'TIKTOK_CRAWLER',
            },
          });
          shopIdInDb = shop.id;
        }

        // 2. Lưu / Cập nhật Product
        const productName = p.productName || p.product_name || 'TikTok Shop Product';
        const productUrl =
          p.productUrl ||
          p.product_url ||
          `https://www.tiktok.com/view/product/${productId}`;
        const productImage = p.productImage || p.product_image || null;

        const product = await this.prisma.product.upsert({
          where: { externalProductId: String(productId) },
          update: {
            name: productName,
            productUrl,
            imageUrl: productImage,
            ...(shopIdInDb ? { shopId: shopIdInDb } : {}),
          },
          create: {
            name: productName,
            externalProductId: String(productId),
            productUrl,
            imageUrl: productImage,
            shopId: shopIdInDb,
          },
        });

        // 3. Liên kết VideoProductAssociation
        await this.prisma.videoProductAssociation.upsert({
          where: {
            videoId_productId: {
              videoId,
              productId: product.id,
            },
          },
          update: {
            evidenceType: 'TAG',
            evidenceSource: 'TIKTOK_SHOP_ANCHOR',
          },
          create: {
            videoId,
            productId: product.id,
            evidenceType: 'TAG',
            evidenceSource: 'TIKTOK_SHOP_ANCHOR',
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to link shop product ${productId} to video ${videoId}: ${err.message}`,
        );
      }
    }
  }
}
