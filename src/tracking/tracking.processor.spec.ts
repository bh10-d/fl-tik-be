import { Test, TestingModule } from '@nestjs/testing';
import { TrackingProcessor } from './tracking.processor';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('TrackingProcessor', () => {
  let processor: TrackingProcessor;

  const mockPrisma = {
    trackingJobRun: {
      create: jest.fn(),
      update: jest.fn(),
    },
    influencer: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    video: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    videoMetricSnapshot: {
      create: jest.fn(),
    },
  };

  const mockProvider = {
    name: 'MOCK',
    isConfigured: jest.fn().mockReturnValue(true),
    fetchCreatorVideos: jest.fn(),
  };

  const mockRegistry = {
    getProvider: jest.fn().mockReturnValue(mockProvider),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string, def: any) => {
      if (key === 'TRACKING_POLL_INTERVAL_SECONDS') return 300;
      return def;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProviderRegistryService, useValue: mockRegistry },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    processor = module.get<TrackingProcessor>(TrackingProcessor);
    // Mock the internal redis lock
    (processor as any).redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    jest.clearAllMocks();
  });

  afterAll(async () => {
    await processor.onModuleDestroy();
  });

  it('should discover new video, set firstSeenAt, and emit video.discovered event', async () => {
    const publishedAt = new Date('2026-03-01T08:00:00Z');

    mockPrisma.trackingJobRun.create.mockResolvedValue({ id: 'run-1' });
    mockPrisma.influencer.findUnique.mockResolvedValue({
      id: 'inf-1',
      username: 'glow_miami',
      trackingStatus: 'ACTIVE',
    });

    mockProvider.fetchCreatorVideos.mockResolvedValue({
      videos: [
        {
          provider: 'MOCK',
          providerVideoId: 'vid-new-1',
          caption: 'New trending lip oil',
          videoUrl: 'https://tiktok.com/@glow_miami/video/new1',
          thumbnailUrl: 'https://thumb.url',
          publishedAt,
          publishedAtSource: 'MOCK_PROVIDER',
          publishedAtVerified: true,
          durationSeconds: 30,
          views: 50000,
          likes: 4000,
          comments: 200,
          shares: 50,
          dataSource: 'MOCK_PROVIDER',
        },
      ],
      totalFetched: 1,
    });

    // Not found in DB -> brand new!
    mockPrisma.video.findUnique.mockResolvedValue(null);
    mockPrisma.video.create.mockResolvedValue({
      id: 'db-vid-1',
      provider: 'MOCK',
      providerVideoId: 'vid-new-1',
      publishedAt,
      firstSeenAt: new Date(),
    });

    const job = { data: { influencerId: 'inf-1' } } as any;
    const result = await processor.process(job);

    expect(result.discovered).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockPrisma.video.create).toHaveBeenCalled();
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'video.discovered',
      expect.objectContaining({
        videoId: 'db-vid-1',
        influencerId: 'inf-1',
        username: 'glow_miami',
      }),
    );
    expect(mockPrisma.trackingJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          videosDiscovered: 1,
        }),
      }),
    );
  });

  it('should update existing video metrics on repeat sync without duplicating video', async () => {
    mockPrisma.trackingJobRun.create.mockResolvedValue({ id: 'run-2' });
    mockPrisma.influencer.findUnique.mockResolvedValue({
      id: 'inf-1',
      username: 'glow_miami',
      trackingStatus: 'ACTIVE',
    });

    mockProvider.fetchCreatorVideos.mockResolvedValue({
      videos: [
        {
          provider: 'MOCK',
          providerVideoId: 'vid-existing-1',
          publishedAt: new Date('2026-03-01T08:00:00Z'),
          views: 65000, // increased views
          likes: 5200,
        },
      ],
    });

    // Found in DB -> already exists!
    const existingInDb = {
      id: 'db-vid-existing',
      provider: 'MOCK',
      providerVideoId: 'vid-existing-1',
      publishedAt: new Date('2026-03-01T08:00:00Z'),
      firstSeenAt: new Date('2026-03-01T08:15:00Z'),
      views: BigInt(50000),
      likes: BigInt(4000),
    };
    mockPrisma.video.findUnique.mockResolvedValue(existingInDb);
    mockPrisma.video.update.mockResolvedValue({
      ...existingInDb,
      views: BigInt(65000),
      likes: BigInt(5200),
    });

    const job = { data: { influencerId: 'inf-1' } } as any;
    const result = await processor.process(job);

    expect(result.discovered).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockPrisma.video.create).not.toHaveBeenCalled();
    expect(mockPrisma.video.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db-vid-existing' },
        data: expect.objectContaining({
          views: BigInt(65000),
          likes: BigInt(5200),
        }),
      }),
    );
    expect(mockEventEmitter.emit).not.toHaveBeenCalled(); // No new video discovered!
  });

  it('should mark trackingStatus as PROVIDER_UNAVAILABLE when provider is unconfigured', async () => {
    mockPrisma.trackingJobRun.create.mockResolvedValue({ id: 'run-3' });
    mockPrisma.influencer.findUnique.mockResolvedValue({
      id: 'inf-1',
      username: 'glow_miami',
      trackingStatus: 'ACTIVE',
    });

    mockProvider.isConfigured.mockReturnValue(false);

    const job = { data: { influencerId: 'inf-1', providerName: 'EXTERNAL' } } as any;

    await expect(processor.process(job)).rejects.toThrow();

    expect(mockPrisma.influencer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inf-1' },
        data: expect.objectContaining({
          trackingStatus: 'PROVIDER_UNAVAILABLE',
        }),
      }),
    );
  });
});

