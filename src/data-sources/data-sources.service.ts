import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateCrawlerConfigDto,
  UpdateProxyConfigDto,
  TestConnectionResponseDto,
  DataSourceStatusDto,
} from './dto/data-source.dto';
import { encryptSecret, maskSecret, decryptSecret } from './crypto.util';
import { ProxyConfigurationService } from './services/proxy-configuration.service';
import { CollectionPolicyService } from './services/collection-policy.service';
import { CrawlerApiProvider } from './providers/crawler-api.provider';

@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly proxyConfigService: ProxyConfigurationService,
    private readonly collectionPolicyService: CollectionPolicyService,
    private readonly crawlerProvider: CrawlerApiProvider,
  ) {}

  /**
   * Return full data sources dashboard state with masked credentials and metrics
   */
  async getAllDataSources() {
    // 1. Internal Crawler Config
    let crawlerDb = await this.prisma.dataSourceConfig.findUnique({
      where: { provider: 'INTERNAL_CRAWLER' },
    });

    const envCrawlerBaseUrl =
      this.configService.get<string>('INTERNAL_CRAWLER_BASE_URL') || 'http://localhost:8000';
    const envCrawlerApiKey = this.configService.get<string>('INTERNAL_CRAWLER_API_KEY') || '';

    if (!crawlerDb) {
      crawlerDb = await this.prisma.dataSourceConfig.create({
        data: {
          provider: 'INTERNAL_CRAWLER',
          isEnabled: Boolean(envCrawlerBaseUrl),
          baseUrl: envCrawlerBaseUrl || null,
          authType: envCrawlerApiKey ? 'BEARER' : 'NONE',
          encryptedApiKey: envCrawlerApiKey ? encryptSecret(envCrawlerApiKey) : null,
          maskedApiKey: envCrawlerApiKey ? maskSecret(envCrawlerApiKey) : null,
          status: envCrawlerBaseUrl ? 'HEALTHY' : 'UNCONFIGURED',
        },
      });
    }

    // 2. Proxy Config
    const proxyConfig = await this.proxyConfigService.getSafeProxyConfig();

    // 3. Collection Policy
    const collectionPolicy = await this.collectionPolicyService.getPolicy();

    return {
      providers: {
        internalCrawler: {
          provider: 'INTERNAL_CRAWLER',
          displayName: 'Internal TikTok Crawler API',
          isEnabled: crawlerDb.isEnabled,
          baseUrl: crawlerDb.baseUrl,
          authType: crawlerDb.authType,
          headerName: crawlerDb.headerName,
          maskedApiKey: crawlerDb.maskedApiKey,
          isConfigured: Boolean(crawlerDb.baseUrl && crawlerDb.baseUrl.trim().length > 0),
          status: crawlerDb.status,
          lastTestedAt: crawlerDb.lastTestedAt?.toISOString() || null,
          lastTestStatus: crawlerDb.lastTestStatus,
          lastTestError: crawlerDb.lastTestError,
          lastSuccessfulRequestAt: crawlerDb.lastSuccessfulRequestAt?.toISOString() || null,
          lastFailedRequestAt: crawlerDb.lastFailedRequestAt?.toISOString() || null,
          lastError: crawlerDb.lastError,
          metrics: {
            totalRequests: crawlerDb.totalRequests,
            successfulRequests: crawlerDb.successfulRequests,
            failedRequests: crawlerDb.failedRequests,
          },
          settings: crawlerDb.settings || {},
        },
      },
      proxy: proxyConfig,
      collectionPolicy: {
        activeProvider: collectionPolicy.activeProvider,
        isCollectionActive: collectionPolicy.isCollectionActive,
        pollIntervalMinutes: collectionPolicy.pollIntervalMinutes,
        maxConcurrentJobs: collectionPolicy.maxConcurrentJobs,
        lastCollectionAttemptAt: collectionPolicy.lastCollectionAttemptAt?.toISOString() || null,
        lastSuccessfulCollectionAt:
          collectionPolicy.lastSuccessfulCollectionAt?.toISOString() || null,
        recentFailureCount: collectionPolicy.recentFailureCount,
        lastError: collectionPolicy.lastError,
      },
    };
  }

  /**
   * Lightweight status summary for header and monitoring widgets
   */
  async getStatus(): Promise<DataSourceStatusDto> {
    const full = await this.getAllDataSources();
    return {
      activeProvider: full.collectionPolicy.activeProvider,
      isCollectionActive: full.collectionPolicy.isCollectionActive,
      pollIntervalMinutes: full.collectionPolicy.pollIntervalMinutes,
      providers: [
        {
          provider: full.providers.internalCrawler.provider,
          isEnabled: full.providers.internalCrawler.isEnabled,
          isConfigured: full.providers.internalCrawler.isConfigured,
          status: full.providers.internalCrawler.status,
          lastTestedAt: full.providers.internalCrawler.lastTestedAt,
          lastTestStatus: full.providers.internalCrawler.lastTestStatus,
          lastSuccessfulRequestAt: full.providers.internalCrawler.lastSuccessfulRequestAt,
          lastError: full.providers.internalCrawler.lastError,
          totalRequests: full.providers.internalCrawler.metrics.totalRequests,
          successfulRequests: full.providers.internalCrawler.metrics.successfulRequests,
          failedRequests: full.providers.internalCrawler.metrics.failedRequests,
        },
      ],
      proxy: {
        isEnabled: full.proxy.isEnabled,
        isConfigured: full.proxy.isConfigured,
        protocol: full.proxy.protocol,
        host: full.proxy.host,
        port: full.proxy.port,
        region: full.proxy.region,
        lastTestedAt: full.proxy.lastTestedAt,
        lastTestStatus: full.proxy.lastTestStatus,
        ownershipNote: full.proxy.ownershipNote,
      },
      collectionMetrics: {
        lastCollectionAttemptAt: full.collectionPolicy.lastCollectionAttemptAt,
        lastSuccessfulCollectionAt: full.collectionPolicy.lastSuccessfulCollectionAt,
        recentFailureCount: full.collectionPolicy.recentFailureCount,
        lastError: full.collectionPolicy.lastError,
      },
    };
  }

  /**
   * Update internal TikTok crawler API configuration
   */
  async updateCrawlerConfig(dto: UpdateCrawlerConfigDto) {
    if (!dto.baseUrl || dto.baseUrl.trim().length === 0) {
      throw new BadRequestException('Crawler API Base URL is required');
    }

    try {
      const url = new URL(dto.baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Base URL must be HTTP or HTTPS');
      }
    } catch (e: any) {
      throw new BadRequestException(`Invalid Crawler API Base URL: ${e.message}`);
    }

    const existing = await this.prisma.dataSourceConfig.findUnique({
      where: { provider: 'INTERNAL_CRAWLER' },
    });

    let encryptedApiKey = existing?.encryptedApiKey;
    let maskedApiKey = existing?.maskedApiKey;

    if (dto.apiKey !== undefined) {
      if (dto.apiKey.trim().length > 0) {
        encryptedApiKey = encryptSecret(dto.apiKey);
        maskedApiKey = maskSecret(dto.apiKey);
      } else {
        encryptedApiKey = null;
        maskedApiKey = null;
      }
    }

    const cleanBaseUrl = dto.baseUrl.trim().replace(/\/+$/, '');

    const saved = await this.prisma.dataSourceConfig.upsert({
      where: { provider: 'INTERNAL_CRAWLER' },
      create: {
        provider: 'INTERNAL_CRAWLER',
        isEnabled: dto.isEnabled !== undefined ? dto.isEnabled : true,
        baseUrl: cleanBaseUrl,
        authType: dto.authType || 'NONE',
        headerName: dto.headerName || null,
        encryptedApiKey,
        maskedApiKey,
        settings: dto.settings || {},
        status: 'UNCONFIGURED',
      },
      update: {
        isEnabled: dto.isEnabled !== undefined ? dto.isEnabled : existing?.isEnabled,
        baseUrl: cleanBaseUrl,
        authType: dto.authType !== undefined ? dto.authType : existing?.authType,
        headerName: dto.headerName !== undefined ? dto.headerName : existing?.headerName,
        encryptedApiKey,
        maskedApiKey,
        settings: dto.settings !== undefined ? (dto.settings as any) : existing?.settings,
      },
    });

    // Refresh crawler provider in-memory cached runtime config
    if (this.crawlerProvider?.refreshRuntimeConfig) {
      await this.crawlerProvider.refreshRuntimeConfig(saved);
    }

    this.logger.log(`Internal Crawler API config saved (baseUrl: ${cleanBaseUrl})`);
    return this.getAllDataSources();
  }

  /**
   * Update proxy configuration
   */
  async updateProxyConfig(dto: UpdateProxyConfigDto) {
    await this.proxyConfigService.updateConfig(dto);
    return this.getAllDataSources();
  }

  /**
   * Execute isolated connection test without triggering collection or synchronization
   */
  async testConnection(provider: string): Promise<TestConnectionResponseDto> {
    const normalized = provider.toUpperCase().replace('-', '_');

    if (normalized === 'INTERNAL_CRAWLER' || normalized === 'CRAWLER') {
      const startTime = Date.now();
      try {
        const pingResult = await this.crawlerProvider.ping();
        const latency = Date.now() - startTime;

        await this.persistTestStatus('INTERNAL_CRAWLER', 'SUCCESS', null, 'HEALTHY');

        return {
          provider: 'INTERNAL_CRAWLER',
          success: true,
          statusCode: pingResult.status,
          latencyMs: latency,
          message: pingResult.message,
          diagnostics: {
            verifiedEndpoints: ['/health', '/status'],
            latencyMs: latency,
          },
        };
      } catch (err: any) {
        const latency = Date.now() - startTime;
        const statusCode = err.status || 502;
        const message = err.message || 'Failed to connect to internal crawler endpoint';

        await this.persistTestStatus('INTERNAL_CRAWLER', 'FAILED', message, 'OFFLINE');

        return {
          provider: 'INTERNAL_CRAWLER',
          success: false,
          statusCode,
          latencyMs: latency,
          message: `Internal Crawler connection failed: ${message}`,
        };
      }
    }

    if (normalized === 'PROXY') {
      return this.proxyConfigService.testConnection();
    }

    throw new NotFoundException(`Unknown provider "${provider}" for connection test`);
  }

  /**
   * Persist provider connection test results safely using upsert
   */
  private async persistTestStatus(
    provider: string,
    testStatus: 'SUCCESS' | 'FAILED',
    error: string | null,
    healthStatus: 'HEALTHY' | 'OFFLINE',
  ): Promise<void> {
    const now = new Date();
    await this.prisma.dataSourceConfig
      .upsert({
        where: { provider },
        create: {
          provider,
          isEnabled: provider === 'INTERNAL_CRAWLER',
          status: healthStatus,
          lastTestedAt: now,
          lastTestStatus: testStatus,
          lastTestError: error,
        },
        update: {
          status: healthStatus,
          lastTestedAt: now,
          lastTestStatus: testStatus,
          lastTestError: error,
        },
      })
      .catch((err) => {
        this.logger.warn(`Failed to persist test status for ${provider}: ${err.message}`);
      });
  }
}
