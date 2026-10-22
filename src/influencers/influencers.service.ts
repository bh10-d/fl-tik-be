import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInfluencerDto } from './dto/create-influencer.dto';
import { UpdateInfluencerDto } from './dto/update-influencer.dto';
import { QueryInfluencerDto } from './dto/query-influencer.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class InfluencersService {
  private readonly logger = new Logger(InfluencersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInfluencerDto) {
    const rawUsername = dto.username.replace(/^@/, '').trim();
    const normalizedUsername = rawUsername.toLowerCase();

    const existing = await this.prisma.influencer.findUnique({
      where: { normalizedUsername },
    });

    if (existing) {
      throw new ConflictException(`Influencer with username "@${rawUsername}" already exists`);
    }

    const influencer = await this.prisma.influencer.create({
      data: {
        username: rawUsername,
        normalizedUsername,
        displayName: dto.displayName || rawUsername,
        avatarUrl:
          dto.avatarUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
        profileUrl: dto.profileUrl || `https://www.tiktok.com/@${rawUsername}`,
        category: dto.category || 'General',
        followers: dto.followers ? BigInt(dto.followers) : null,
        trackingStatus: 'ACTIVE',
        source: 'MANUAL',
        nextScheduledCheckAt: new Date(),
      },
    });

    return this.formatInfluencer(influencer);
  }

  async findAll(query: QueryInfluencerDto) {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      trackingStatus,
      lastVideoFilter,
      minFollowers,
      maxFollowers,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.InfluencerWhereInput = {};

    if (search) {
      const searchClean = search.replace(/^@/, '').trim();
      where.OR = [
        { username: { contains: searchClean, mode: 'insensitive' } },
        { displayName: { contains: searchClean, mode: 'insensitive' } },
      ];
    }

    if (category && category !== 'all') {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (trackingStatus && trackingStatus !== 'all') {
      where.trackingStatus = { equals: trackingStatus.toUpperCase(), mode: 'insensitive' };
    }

    if (lastVideoFilter && lastVideoFilter !== 'all') {
      const now = new Date();
      if (lastVideoFilter === 'recent_30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        where.videos = { some: { publishedAt: { gte: d } } };
      } else if (lastVideoFilter === 'dormant_30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        where.videos = {
          some: {},
          none: { publishedAt: { gte: d } },
        };
      } else if (lastVideoFilter === 'dormant_60d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 60);
        where.videos = {
          some: {},
          none: { publishedAt: { gte: d } },
        };
      } else if (lastVideoFilter === 'dormant_90d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        where.videos = {
          some: {},
          none: { publishedAt: { gte: d } },
        };
      } else if (lastVideoFilter === 'dormant_180d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 180);
        where.videos = {
          some: {},
          none: { publishedAt: { gte: d } },
        };
      } else if (lastVideoFilter === 'no_videos') {
        where.videos = { none: {} };
      }
    }

    if (minFollowers !== undefined || maxFollowers !== undefined) {
      where.followers = {};
      if (minFollowers !== undefined) where.followers.gte = BigInt(minFollowers);
      if (maxFollowers !== undefined) where.followers.lte = BigInt(maxFollowers);
    }

    const orderBy: Prisma.InfluencerOrderByWithRelationInput = {};
    if (sortBy === 'followers' || sortBy === 'likes' || sortBy === 'createdAt' || sortBy === 'lastCheckedAt') {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = 'desc';
    }

    const [total, items] = await Promise.all([
      this.prisma.influencer.count({ where }),
      this.prisma.influencer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          videos: {
            orderBy: { publishedAt: 'desc' },
            take: 1,
            select: { publishedAt: true, firstSeenAt: true },
          },
          _count: {
            select: { videos: true },
          },
        },
      }),
    ]);

    const formattedData = items.map((item) => {
      const latestVideo = item.videos[0];
      return {
        ...this.formatInfluencer(item),
        videoCount: item._count.videos,
        latestPublishedAt: latestVideo?.publishedAt ? latestVideo.publishedAt.toISOString() : null,
        latestDetectedAt: latestVideo?.firstSeenAt ? latestVideo.firstSeenAt.toISOString() : null,
      };
    });

    return new PaginatedResponseDto(formattedData, total, page, limit);
  }

  async findOne(id: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { id },
      include: {
        videos: {
          orderBy: { publishedAt: 'desc' },
          take: 50,
          include: {
            productAssociations: {
              include: {
                product: {
                  include: {
                    shop: true,
                  },
                },
              },
            },
          },
        },
        metricSnapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 10,
        },
        trackingJobs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!influencer) {
      throw new NotFoundException(`Influencer with ID "${id}" not found`);
    }

    // Extract unique products tagged across creator's videos
    const productMap = new Map<string, any>();
    for (const v of influencer.videos) {
      for (const assoc of (v as any).productAssociations || []) {
        if (assoc.product && !productMap.has(assoc.product.id)) {
          productMap.set(assoc.product.id, {
            ...assoc.product,
            shopName: assoc.product.shop?.name || null,
            lastTaggedAt: v.publishedAt,
            videoTitle: v.caption,
            videoUrl: v.videoUrl,
          });
        }
      }
    }

    return {
      ...this.formatInfluencer(influencer),
      videos: influencer.videos.map((v) => ({
        ...v,
        views: v.views ? Number(v.views) : null,
        likes: v.likes ? Number(v.likes) : null,
        comments: v.comments ? Number(v.comments) : null,
        shares: v.shares ? Number(v.shares) : null,
        productAssociations: (v as any).productAssociations,
      })),
      taggedProducts: Array.from(productMap.values()),
      metricSnapshots: influencer.metricSnapshots.map((m) => ({
        ...m,
        followers: m.followers ? Number(m.followers) : null,
        likes: m.likes ? Number(m.likes) : null,
        sales: m.sales ? Number(m.sales) : null,
      })),
      trackingJobs: influencer.trackingJobs,
    };
  }

  async update(id: string, dto: UpdateInfluencerDto) {
    await this.findOne(id);

    const data: Prisma.InfluencerUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.profileUrl !== undefined) data.profileUrl = dto.profileUrl;
    if (dto.followers !== undefined) data.followers = BigInt(dto.followers);
    if (dto.trackingStatus !== undefined) data.trackingStatus = dto.trackingStatus.toUpperCase();

    const updated = await this.prisma.influencer.update({
      where: { id },
      data,
    });

    return this.formatInfluencer(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.influencer.delete({ where: { id } });
    return { success: true, message: `Influencer "${id}" deleted successfully` };
  }

  async setTrackingStatus(id: string, status: 'ACTIVE' | 'PAUSED') {
    await this.findOne(id);
    const updated = await this.prisma.influencer.update({
      where: { id },
      data: {
        trackingStatus: status,
        nextScheduledCheckAt: status === 'ACTIVE' ? new Date() : null,
      },
    });
    return this.formatInfluencer(updated);
  }

  async bulkSetTrackingStatus(ids: string[], status: 'ACTIVE' | 'PAUSED') {
    const result = await this.prisma.influencer.updateMany({
      where: { id: { in: ids } },
      data: {
        trackingStatus: status,
        nextScheduledCheckAt: status === 'ACTIVE' ? new Date() : null,
      },
    });
    return {
      affectedCount: result.count,
      status: status.toLowerCase(),
    };
  }

  async bulkRemove(ids: string[]) {
    const result = await this.prisma.influencer.deleteMany({
      where: { id: { in: ids } },
    });
    return {
      affectedCount: result.count,
      message: `Successfully deleted ${result.count} influencer(s)`,
    };
  }

  async getDormantSummary(days: number = 180) {
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - days);

    const dormantWithVideos = await this.prisma.influencer.findMany({
      where: {
        videos: {
          some: {},
          none: { publishedAt: { gte: cutOffDate } },
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        category: true,
        trackingStatus: true,
        followers: true,
        videos: {
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: { publishedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const noVideosCount = await this.prisma.influencer.count({
      where: { videos: { none: {} } },
    });

    return {
      thresholdDays: days,
      cutOffDate: cutOffDate.toISOString(),
      dormantCount: dormantWithVideos.length,
      noVideosCount,
      totalInactive: dormantWithVideos.length + noVideosCount,
      dormantInfluencers: dormantWithVideos.map((i) => ({
        id: i.id,
        username: i.username,
        displayName: i.displayName,
        avatarUrl: i.avatarUrl,
        category: i.category,
        followers: i.followers ? Number(i.followers) : null,
        trackingStatus: i.trackingStatus.toLowerCase(),
        latestPublishedAt: i.videos[0]?.publishedAt ? i.videos[0].publishedAt.toISOString() : null,
      })),
    };
  }

  private formatInfluencer(item: any) {
    return {
      id: item.id,
      username: item.username,
      displayName: item.displayName,
      profileUrl: item.profileUrl,
      avatarUrl: item.avatarUrl,
      externalUserId: item.externalUserId,
      followers: item.followers ? Number(item.followers) : null,
      likes: item.likes ? Number(item.likes) : null,
      category: item.category,
      trackingStatus: item.trackingStatus.toLowerCase(),
      source: item.source,
      createdAt: item.createdAt ? item.createdAt.toISOString() : null,
      updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
      lastCheckedAt: item.lastCheckedAt ? item.lastCheckedAt.toISOString() : null,
      lastSuccessfulSyncAt: item.lastSuccessfulSyncAt ? item.lastSuccessfulSyncAt.toISOString() : null,
      nextScheduledCheckAt: item.nextScheduledCheckAt ? item.nextScheduledCheckAt.toISOString() : null,
      lastSyncError: item.lastSyncError,
    };
  }
}

