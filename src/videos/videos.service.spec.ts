import { Test, TestingModule } from '@nestjs/testing';
import { VideosService } from './videos.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

describe('VideosService', () => {
  let service: VideosService;

  const mockPrisma = {
    video: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    videoMetricSnapshot: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockProvider = {
    refreshVideoMetrics: jest.fn(),
  };

  const mockRegistry = {
    getProvider: jest.fn().mockReturnValue(mockProvider),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProviderRegistryService, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<VideosService>(VideosService);
    jest.clearAllMocks();
  });

  it('should return paginated videos with separate publishedAt and firstSeenAt timestamps', async () => {
    const publishedDate = new Date('2026-03-01T10:00:00.000Z');
    const firstSeenDate = new Date('2026-03-01T12:30:00.000Z');

    mockPrisma.video.count.mockResolvedValue(1);
    mockPrisma.video.findMany.mockResolvedValue([
      {
        id: 'vid-1',
        provider: 'MOCK',
        providerVideoId: 'm-1',
        creatorId: 'inf-1',
        caption: 'Viral lipstick swatch!',
        videoUrl: 'https://tiktok.com/@creator/video/1',
        thumbnailUrl: 'https://thumb.url',
        publishedAt: publishedDate,
        publishedAtSource: 'MOCK_PROVIDER',
        publishedAtVerified: true,
        firstSeenAt: firstSeenDate,
        lastSeenAt: firstSeenDate,
        durationSeconds: 45,
        views: BigInt(150000),
        likes: null, // Null metrics must be preserved
        comments: null,
        shares: null,
        dataSource: 'MOCK_PROVIDER',
        creator: { id: 'inf-1', username: 'creator', displayName: 'Creator' },
        productAssociations: [],
      },
    ]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data.length).toBe(1);
    const video = result.data[0];
    expect(video.publishedAt).toBe(publishedDate.toISOString());
    expect(video.firstSeenAt).toBe(firstSeenDate.toISOString());
    expect(video.publishedAt).not.toBe(video.firstSeenAt); // Strictly separate!
    expect(video.views).toBe(150000);
    expect(video.likes).toBeNull(); // Not converted to 0
  });

  it('should refresh video metrics and record a metric snapshot', async () => {
    const existingVideo = {
      id: 'vid-1',
      provider: 'MOCK',
      providerVideoId: 'm-1',
      views: BigInt(100000),
      likes: BigInt(5000),
      comments: BigInt(200),
      shares: BigInt(50),
    };

    mockPrisma.video.findUnique.mockResolvedValue(existingVideo);
    mockProvider.refreshVideoMetrics.mockResolvedValue({
      providerVideoId: 'm-1',
      views: 125000,
      likes: 6500,
      comments: 250,
      shares: 75,
      capturedAt: new Date(),
    });

    mockPrisma.video.update.mockResolvedValue({
      ...existingVideo,
      views: BigInt(125000),
      likes: BigInt(6500),
      comments: BigInt(250),
      shares: BigInt(75),
      productAssociations: [],
    });

    const result = await service.refreshVideo('vid-1');

    expect(mockRegistry.getProvider).toHaveBeenCalledWith('MOCK');
    expect(mockProvider.refreshVideoMetrics).toHaveBeenCalledWith('m-1');
    expect(mockPrisma.videoMetricSnapshot.create).toHaveBeenCalled();
    expect(result.views).toBe(125000);
    expect(result.likes).toBe(6500);
  });
});

