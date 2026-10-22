import { Test, TestingModule } from '@nestjs/testing';
import { DataSourcesService } from './data-sources.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProxyConfigurationService } from './services/proxy-configuration.service';
import { CollectionPolicyService } from './services/collection-policy.service';
import { CrawlerApiProvider } from './providers/crawler-api.provider';

describe('DataSourcesService', () => {
  let service: DataSourcesService;
  let mockPrisma: any;
  let mockProxyService: any;
  let mockPolicyService: any;
  let mockCrawlerProvider: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockPrisma = {
      dataSourceConfig: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    mockProxyService = {
      getSafeProxyConfig: jest.fn().mockResolvedValue({
        id: 'default',
        isEnabled: false,
        protocol: 'HTTP',
        host: '192.168.1.10',
        port: 8080,
        username: 'user1',
        maskedPassword: '••••••••••••1234',
        isConfigured: true,
      }),
      updateConfig: jest.fn(),
      testConnection: jest.fn().mockResolvedValue({
        provider: 'PROXY',
        success: true,
        statusCode: 200,
        latencyMs: 15,
        message: 'Proxy is reachable',
      }),
    };

    mockPolicyService = {
      getPolicy: jest.fn().mockResolvedValue({
        id: 'default',
        activeProvider: 'INTERNAL_CRAWLER',
        isCollectionActive: true,
        pollIntervalMinutes: 15,
        maxConcurrentJobs: 3,
        recentFailureCount: 0,
      }),
      updatePolicy: jest.fn(),
      stopCollection: jest.fn().mockResolvedValue({
        id: 'default',
        isCollectionActive: false,
      }),
      startCollection: jest.fn().mockResolvedValue({
        id: 'default',
        isCollectionActive: true,
      }),
    };

    mockCrawlerProvider = {
      ping: jest.fn().mockResolvedValue({
        latencyMs: 30,
        status: 200,
        message: 'Healthy',
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'INTERNAL_CRAWLER_BASE_URL') return 'http://127.0.0.1:4000';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSourcesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ProxyConfigurationService, useValue: mockProxyService },
        { provide: CollectionPolicyService, useValue: mockPolicyService },
        { provide: CrawlerApiProvider, useValue: mockCrawlerProvider },
      ],
    }).compile();

    service = module.get<DataSourcesService>(DataSourcesService);
  });

  it('should initialize Internal Crawler configuration if not present', async () => {
    mockPrisma.dataSourceConfig.findUnique.mockResolvedValue(null);
    mockPrisma.dataSourceConfig.create.mockImplementation((args: any) => ({
      ...args.data,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
    }));

    const result = await service.getAllDataSources();

    expect(result.providers.internalCrawler).toBeDefined();
    expect(mockPrisma.dataSourceConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'INTERNAL_CRAWLER',
          baseUrl: 'http://127.0.0.1:4000',
        }),
      }),
    );
  });

  it('should mask API keys and proxy passwords in response', async () => {
    mockPrisma.dataSourceConfig.findUnique.mockResolvedValue({
      provider: 'INTERNAL_CRAWLER',
      isEnabled: true,
      baseUrl: 'http://127.0.0.1:4000',
      maskedApiKey: '••••••••••••4321',
      encryptedApiKey: 'mock-encrypted-key',
      totalRequests: 10,
      successfulRequests: 10,
      failedRequests: 0,
    });

    const result = await service.getAllDataSources();

    expect(result.providers.internalCrawler.maskedApiKey).toBe('••••••••••••4321');
    expect((result.providers.internalCrawler as any).encryptedApiKey).toBeUndefined();
    expect(result.proxy.maskedPassword).toBe('••••••••••••1234');
    expect((result.proxy as any).password).toBeUndefined();
  });

  it('should test internal crawler connectivity using crawler ping without collection', async () => {
    mockPrisma.dataSourceConfig.upsert.mockResolvedValue({});

    const result = await service.testConnection('INTERNAL_CRAWLER');

    expect(mockCrawlerProvider.ping).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.provider).toBe('INTERNAL_CRAWLER');
    expect(mockPrisma.dataSourceConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: 'INTERNAL_CRAWLER' },
        update: expect.objectContaining({
          lastTestStatus: 'SUCCESS',
          status: 'HEALTHY',
        }),
      }),
    );
  });
});

