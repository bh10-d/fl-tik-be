import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryVideoDto } from './dto/query-video.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { CrawlerApiProvider } from '../data-sources/providers/crawler-api.provider';
import { Prisma } from '@prisma/client';

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly crawlerProvider: CrawlerApiProvider,
  ) {}

  async findAll(query: QueryVideoDto) {
    const {
      page = 1,
      limit = 20,
      creatorId,
      username,
      publishedAfter,
      publishedBefore,
      firstSeenAfter,
      firstSeenBefore,
      shopId,
      productId,
      isNew,
      minViews,
      maxViews,
      minLikes,
      provider,
      dataSource,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
      search,
    } = query;

    const where: Prisma.VideoWhereInput = {};

    if (search) {
      const searchClean = search.replace(/^@/, '').trim();
      where.OR = [
        { caption: { contains: searchClean, mode: 'insensitive' } },
        { creator: { username: { contains: searchClean, mode: 'insensitive' } } },
        { creator: { displayName: { contains: searchClean, mode: 'insensitive' } } },
      ];
    }

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (username) {
      where.creator = {
        normalizedUsername: username.replace(/^@/, '').trim().toLowerCase(),
      };
    }

    if (publishedAfter || publishedBefore) {
      where.publishedAt = {};
      if (publishedAfter) where.publishedAt.gte = publishedAfter;
      if (publishedBefore) where.publishedAt.lte = publishedBefore;
    }

    if (firstSeenAfter || firstSeenBefore) {
      where.firstSeenAt = {};
      if (firstSeenAfter) where.firstSeenAt.gte = firstSeenAfter;
      if (firstSeenBefore) where.firstSeenAt.lte = firstSeenBefore;
    }

    if (isNew) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      where.firstSeenAt = { ...(where.firstSeenAt as any), gte: twentyFourHoursAgo };
    }

    if (minViews !== undefined || maxViews !== undefined) {
      where.views = {};
      if (minViews !== undefined) where.views.gte = BigInt(minViews);
      if (maxViews !== undefined) where.views.lte = BigInt(maxViews);
    }

    if (minLikes !== undefined) {
      where.likes = { gte: BigInt(minLikes) };
    }

    if (provider) {
      where.provider = { equals: provider.toUpperCase() };
    }

    if (dataSource) {
      where.dataSource = { equals: dataSource, mode: 'insensitive' };
    }

    if (productId) {
      where.productAssociations = { some: { productId } };
    } else if (shopId) {
      where.productAssociations = { some: { product: { shopId } } };
    }

    const orderBy: Prisma.VideoOrderByWithRelationInput = {};
    if (sortBy === 'publishedAt' || sortBy === 'firstSeenAt' || sortBy === 'views' || sortBy === 'likes') {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.publishedAt = 'desc';
    }

    const [total, items] = await Promise.all([
      this.prisma.video.count({ where }),
      this.prisma.video.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          productAssociations: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  shopId: true,
                  productUrl: true,
                  imageUrl: true,
                },
              },
            },
            take: 1,
          },
        },
      }),
    ]);

    const formattedData = items.map((v) => this.formatVideo(v));
    return new PaginatedResponseDto(formattedData, total, page, limit);
  }

  async findOne(id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: {
        creator: true,
        productAssociations: {
          include: {
            product: {
              include: {
                shop: true,
              },
            },
          },
        },
        metricSnapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!video) {
      throw new NotFoundException(`Video with ID "${id}" not found`);
    }

    return this.formatVideo(video);
  }

  async findRecent(limit = 20) {
    const items = await this.prisma.video.findMany({
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
        productAssociations: {
          include: {
            product: true,
          },
          take: 1,
        },
      },
    });

    return items.map((v) => this.formatVideo(v));
  }

  async findByInfluencer(influencerId: string, query: QueryVideoDto) {
    return this.findAll({
      ...query,
      creatorId: influencerId,
    });
  }

  async getVideoMetrics(videoId: string) {
    await this.findOne(videoId);
    const snapshots = await this.prisma.videoMetricSnapshot.findMany({
      where: { videoId },
      orderBy: { capturedAt: 'asc' },
    });

    return snapshots.map((s) => ({
      id: s.id,
      videoId: s.videoId,
      capturedAt: s.capturedAt.toISOString(),
      views: s.views ? Number(s.views) : null,
      likes: s.likes ? Number(s.likes) : null,
      comments: s.comments ? Number(s.comments) : null,
      shares: s.shares ? Number(s.shares) : null,
      source: s.source,
    }));
  }

  async refreshVideo(id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
    });

    if (!video) {
      throw new NotFoundException(`Video with ID "${id}" not found`);
    }

    const provider = this.providerRegistry.getProvider(video.provider);
    if (!provider.refreshVideoMetrics) {
      throw new NotFoundException(`Provider "${video.provider}" does not support metric refresh`);
    }

    const metrics = await provider.refreshVideoMetrics(video.providerVideoId);

    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        views: metrics.views !== undefined && metrics.views !== null ? BigInt(metrics.views) : video.views,
        likes: metrics.likes !== undefined && metrics.likes !== null ? BigInt(metrics.likes) : video.likes,
        comments: metrics.comments !== undefined && metrics.comments !== null ? BigInt(metrics.comments) : video.comments,
        shares: metrics.shares !== undefined && metrics.shares !== null ? BigInt(metrics.shares) : video.shares,
        lastSeenAt: new Date(),
      },
      include: {
        creator: true,
        productAssociations: {
          include: { product: true },
          take: 1,
        },
      },
    });

    // Record snapshot
    await this.prisma.videoMetricSnapshot.create({
      data: {
        videoId: id,
        source: video.provider,
        views: updated.views,
        likes: updated.likes,
        comments: updated.comments,
        shares: updated.shares,
        capturedAt: metrics.capturedAt,
      },
    });

    return this.formatVideo(updated);
  }

  async getVideoComments(id: string, cursor?: number) {
    const video = await this.prisma.video.findUnique({
      where: { id },
    });

    if (!video) {
      throw new NotFoundException(`Video with ID "${id}" not found`);
    }

    const videoRef = video.videoUrl || video.providerVideoId;
    return this.crawlerProvider.fetchVideoComments(videoRef, cursor);
  }

  private formatVideo(v: any) {
    const now = Date.now();
    const firstSeenMs = v.firstSeenAt ? new Date(v.firstSeenAt).getTime() : now;
    const isNew = now - firstSeenMs <= 24 * 60 * 60 * 1000;

    const primaryAssoc = v.productAssociations?.[0];
    const shopId = primaryAssoc?.product?.shopId || null;
    const productId = primaryAssoc?.productId || null;

    return {
      id: v.id,
      creatorId: v.creatorId,
      caption: v.caption || '',
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl || '',
      publishedAt: v.publishedAt ? new Date(v.publishedAt).toISOString() : new Date().toISOString(),
      publishedAtSource: v.publishedAtSource,
      publishedAtVerified: Boolean(v.publishedAtVerified),
      firstSeenAt: v.firstSeenAt ? new Date(v.firstSeenAt).toISOString() : new Date().toISOString(),
      lastSeenAt: v.lastSeenAt ? new Date(v.lastSeenAt).toISOString() : new Date().toISOString(),
      durationSeconds: v.durationSeconds,
      views: v.views !== null && v.views !== undefined ? Number(v.views) : null,
      likes: v.likes !== null && v.likes !== undefined ? Number(v.likes) : null,
      comments: v.comments !== null && v.comments !== undefined ? Number(v.comments) : null,
      shares: v.shares !== null && v.shares !== undefined ? Number(v.shares) : null,
      shopId,
      productId,
      isNew,
      dataSource: v.dataSource,
      creator: v.creator
        ? {
            id: v.creator.id,
            username: v.creator.username,
            displayName: v.creator.displayName,
            avatarUrl: v.creator.avatarUrl,
          }
        : undefined,
      product: primaryAssoc?.product || null,
      rawMetadata: v.rawMetadata,
    };
  }
}

