import { Test, TestingModule } from '@nestjs/testing';
import { CrawlerApiProvider } from './crawler-api.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProxyConfigurationService } from '../services/proxy-configuration.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('CrawlerApiProvider', () => {
  let provider: CrawlerApiProvider;
  let mockPrisma: any;
  let mockConfig: any;

  beforeEach(async () => {
    mockPrisma = {
      dataSourceConfig: {
        findUnique: jest.fn(),
      },
      proxyConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'INTERNAL_CRAWLER_BASE_URL') return 'http://127.0.0.1:4000';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrawlerApiProvider,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    provider = module.get<CrawlerApiProvider>(CrawlerApiProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should have provider name "INTERNAL_CRAWLER"', () => {
    expect(provider.name).toBe('INTERNAL_CRAWLER');
  });

  it('should reject request when provider is disabled', async () => {
    mockPrisma.dataSourceConfig.findUnique.mockResolvedValue({
      provider: 'INTERNAL_CRAWLER',
      isEnabled: false,
      baseUrl: 'http://127.0.0.1:4000',
    });

    await expect(provider.resolveCreator('testuser')).rejects.toThrow(HttpException);
  });

  it('should call configured crawler URL when resolving creator', async () => {
    mockPrisma.dataSourceConfig.findUnique.mockResolvedValue({
      provider: 'INTERNAL_CRAWLER',
      isEnabled: true,
      baseUrl: 'http://127.0.0.1:4000',
      authType: 'BEARER',
      encryptedApiKey: null,
    });

    const mockFetch = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: 'user-123',
          unique_id: 'testcreator',
          nickname: 'Test Creator',
          stats: {
            follower_count: 50000,
            heart_count: 200000,
          },
        },
      }),
    } as any);

    const resolved = await provider.resolveCreator('testcreator');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/users/profile?user=testcreator',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(resolved.username).toBe('testcreator');
    expect(resolved.followers).toBe(50000);
    expect(resolved.provider).toBe('INTERNAL_CRAWLER');
  });

  it('should accurately normalize videos from crawler response', async () => {
    mockPrisma.dataSourceConfig.findUnique.mockResolvedValue({
      provider: 'INTERNAL_CRAWLER',
      isEnabled: true,
      baseUrl: 'http://127.0.0.1:4000',
      authType: 'NONE',
    });

    const mockFetch = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        videos: [
          {
            id: 'vid-999',
            description: 'Amazing test video #tag',
            link: 'https://tiktok.com/@test/video/vid-999',
            created_at: 1718000000,
            stats: {
              play_count: 12000,
              like_count: null,
            },
          },
        ],
        has_more: false,
      }),
    } as any);

    const res = await provider.fetchCreatorVideos('testcreator');
    expect(res.videos.length).toBe(1);
    expect(res.totalFetched).toBe(1);
    const video = res.videos[0];
    expect(video.providerVideoId).toBe('vid-999');
    expect(video.publishedAt).toBeInstanceOf(Date);
    expect(video.views).toBe(12000);
    expect(video.likes).toBeNull();
    expect(video.dataSource).toBe('INTERNAL_CRAWLER');
  });

  it('should forward proxy headers when proxy is enabled', async () => {
    mockPrisma.dataSourceConfig.findUnique.mockResolvedValue({
      provider: 'INTERNAL_CRAWLER',
      isEnabled: true,
      baseUrl: 'http://127.0.0.1:4000',
      authType: 'NONE',
    });

    mockPrisma.proxyConfig.findUnique.mockResolvedValue({
      isEnabled: true,
      protocol: 'HTTP',
      host: 'proxy.us-residential.com',
      port: 10000,
      region: 'US',
    });

    const mockFetch = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    } as any);

    await provider.ping();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-crawler-proxy-enabled': 'true',
          'x-crawler-proxy-host': 'proxy.us-residential.com',
          'x-crawler-proxy-port': '10000',
        }),
      }),
    );
  });
});

