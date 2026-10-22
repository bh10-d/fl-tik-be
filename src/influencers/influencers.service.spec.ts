import { Test, TestingModule } from '@nestjs/testing';
import { InfluencersService } from './influencers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('InfluencersService', () => {
  let service: InfluencersService;
  let prisma: PrismaService;

  const mockPrisma = {
    influencer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfluencersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InfluencersService>(InfluencersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should create an influencer with normalized username', async () => {
    mockPrisma.influencer.findUnique.mockResolvedValue(null);
    mockPrisma.influencer.create.mockResolvedValue({
      id: 'inf-123',
      username: 'test_creator',
      normalizedUsername: 'test_creator',
      displayName: 'Test Creator',
      profileUrl: 'https://www.tiktok.com/@test_creator',
      avatarUrl: 'https://avatar.url',
      followers: BigInt(50000),
      likes: BigInt(200000),
      category: 'Tech',
      trackingStatus: 'ACTIVE',
      source: 'MANUAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create({
      username: '@test_creator',
      displayName: 'Test Creator',
      followers: 50000,
      category: 'Tech',
    });

    expect(mockPrisma.influencer.findUnique).toHaveBeenCalledWith({
      where: { normalizedUsername: 'test_creator' },
    });
    expect(result.username).toBe('test_creator');
    expect(result.followers).toBe(50000);
    expect(result.trackingStatus).toBe('active');
  });

  it('should throw ConflictException when creating a duplicate username', async () => {
    mockPrisma.influencer.findUnique.mockResolvedValue({ id: 'inf-existing', username: 'existing_user' });

    await expect(
      service.create({ username: 'existing_user' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should support pagination and filtering in findAll', async () => {
    mockPrisma.influencer.count.mockResolvedValue(1);
    mockPrisma.influencer.findMany.mockResolvedValue([
      {
        id: 'inf-1',
        username: 'beauty_queen',
        displayName: 'Beauty Queen',
        profileUrl: 'https://tiktok.com/@beauty_queen',
        avatarUrl: null,
        followers: BigInt(120000),
        likes: null,
        category: 'Beauty',
        trackingStatus: 'ACTIVE',
        source: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCheckedAt: new Date(),
        videos: [{ publishedAt: new Date(), firstSeenAt: new Date() }],
        _count: { videos: 5 },
      },
    ]);

    const result = await service.findAll({
      page: 1,
      limit: 10,
      category: 'Beauty',
      trackingStatus: 'active',
      minFollowers: 10000,
    });

    expect(result.data.length).toBe(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
    expect(result.data[0].username).toBe('beauty_queen');
    expect(result.data[0].videoCount).toBe(5);
  });

  it('should throw NotFoundException on findOne when influencer does not exist', async () => {
    mockPrisma.influencer.findUnique.mockResolvedValue(null);

    await expect(service.findOne('inf-nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should pause and track influencer status', async () => {
    mockPrisma.influencer.findUnique.mockResolvedValue({
      id: 'inf-1',
      username: 'user1',
      trackingStatus: 'ACTIVE',
      videos: [],
      metricSnapshots: [],
      trackingJobs: [],
    });
    mockPrisma.influencer.update.mockResolvedValue({
      id: 'inf-1',
      username: 'user1',
      trackingStatus: 'PAUSED',
    });

    const result = await service.setTrackingStatus('inf-1', 'PAUSED');
    expect(result.trackingStatus).toBe('paused');
    expect(mockPrisma.influencer.update).toHaveBeenCalledWith({
      where: { id: 'inf-1' },
      data: { trackingStatus: 'PAUSED', nextScheduledCheckAt: null },
    });
  });

  it('should bulk pause influencers', async () => {
    mockPrisma.influencer.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.bulkSetTrackingStatus(['inf-1', 'inf-2', 'inf-3'], 'PAUSED');
    expect(result.affectedCount).toBe(3);
    expect(result.status).toBe('paused');
  });

  it('should bulk remove influencers', async () => {
    mockPrisma.influencer.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.bulkRemove(['inf-1', 'inf-2']);
    expect(result.affectedCount).toBe(2);
    expect(mockPrisma.influencer.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['inf-1', 'inf-2'] } },
    });
  });
});

