import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockPrisma = {
    influencer: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    video: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    influencerMetricSnapshot: {
      aggregate: jest.fn(),
    },
    trackingJobRun: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    importBatch: {
      findMany: jest.fn(),
    },
  };

  const mockRegistry = {
    getAllProviders: jest.fn().mockReturnValue([
      { name: 'MOCK', isConfigured: true, capabilities: {} },
      { name: 'TIKTOK_DISPLAY', isConfigured: false, capabilities: {} },
    ]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProviderRegistryService, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  it('should return real overview aggregates without fabricated data', async () => {
    mockPrisma.influencer.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    mockPrisma.video.count.mockResolvedValueOnce(45).mockResolvedValueOnce(5);
    mockPrisma.video.aggregate.mockResolvedValue({
      _sum: { views: BigInt(2500000), likes: BigInt(180000) },
    });
    mockPrisma.influencerMetricSnapshot.aggregate.mockResolvedValue({
      _sum: { gmv: 75000.5, sales: BigInt(1200) },
    });
    mockPrisma.trackingJobRun.count.mockResolvedValue(1);

    const result = await service.getOverview();

    expect(result.totalCreators).toBe(10);
    expect(result.activeTrackedCreators).toBe(8);
    expect(result.totalVideosTracked).toBe(45);
    expect(result.newVideos24h).toBe(5);
    expect(result.totalViews).toBe(2500000);
    expect(result.totalLikes).toBe(180000);
    expect(result.importedGmv).toBe(75000.5);
    expect(result.importedSales).toBe(1200);
  });

  it('should return empty/zero metrics accurately when dataset is empty', async () => {
    mockPrisma.influencer.count.mockResolvedValue(0);
    mockPrisma.video.count.mockResolvedValue(0);
    mockPrisma.video.aggregate.mockResolvedValue({ _sum: { views: null, likes: null } });
    mockPrisma.influencerMetricSnapshot.aggregate.mockResolvedValue({ _sum: { gmv: null, sales: null } });
    mockPrisma.trackingJobRun.count.mockResolvedValue(0);

    const result = await service.getOverview();

    expect(result.totalCreators).toBe(0);
    expect(result.totalVideosTracked).toBe(0);
    expect(result.totalViews).toBe(0);
    expect(result.importedGmv).toBe(0);
  });

  it('should calculate tracking health and success rate accurately', async () => {
    mockPrisma.trackingJobRun.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(95)  // completed
      .mockResolvedValueOnce(5);   // failed
    mockPrisma.trackingJobRun.findMany.mockResolvedValue([
      {
        errorCode: 'SYNC_ERROR',
        errorMessage: 'Network timeout',
        startedAt: new Date(),
        influencer: { username: 'test_influencer' },
      },
    ]);

    const result = await service.getTrackingHealth();

    expect(result.totalRuns).toBe(100);
    expect(result.completedRuns).toBe(95);
    expect(result.failedRuns).toBe(5);
    expect(result.successRate).toBe(95);
    expect(result.providers.length).toBe(2);
    expect(result.recentErrors[0].username).toBe('test_influencer');
  });
});

