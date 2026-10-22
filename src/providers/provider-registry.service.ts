import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreatorVideoProvider } from './creator-video-provider.interface';
import { MockVideoProvider } from './mock/mock-video.provider';
import { TikTokDisplayProvider } from './tiktok-display/tiktok-display.provider';
import { ExternalVideoProvider } from './external-video-provider/external-video.provider';
import { CrawlerApiProvider } from '../data-sources/providers/crawler-api.provider';

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers: Map<string, CreatorVideoProvider> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockVideoProvider,
    private readonly tiktokProvider: TikTokDisplayProvider,
    private readonly externalProvider: ExternalVideoProvider,
    @Optional() private readonly crawlerProvider?: CrawlerApiProvider,
  ) {
    if (this.crawlerProvider) {
      this.register(this.crawlerProvider);
    }
    if (this.mockProvider) {
      this.register(this.mockProvider);
    }
    if (this.tiktokProvider) {
      this.register(this.tiktokProvider);
    }
    if (this.externalProvider) {
      this.register(this.externalProvider);
    }
  }

  register(provider?: CreatorVideoProvider): void {
    if (!provider || !provider.name) {
      return;
    }
    const key = provider.name.toUpperCase();
    this.providers.set(key, provider);
    this.logger.log(`Registered provider: ${key} (configured: ${provider.isConfigured()})`);
  }

  getProvider(name?: string): CreatorVideoProvider {
    const defaultProviderName =
      name || this.configService.get<string>('DEFAULT_VIDEO_PROVIDER') || 'INTERNAL_CRAWLER';
    const normalizedKey = defaultProviderName.toUpperCase().replace(/-/g, '_');

    let provider = this.providers.get(normalizedKey);
    if (!provider) {
      if ((normalizedKey.includes('CRAWLER') || normalizedKey.includes('INTERNAL')) && this.crawlerProvider) {
        provider = this.crawlerProvider;
      } else if (normalizedKey.includes('TIKTOK')) {
        provider = this.tiktokProvider;
      } else if (normalizedKey.includes('EXTERNAL')) {
        provider = this.externalProvider;
      } else if (this.crawlerProvider) {
        provider = this.crawlerProvider;
      } else {
        provider = this.mockProvider;
      }
    }

    if (!provider) {
      throw new NotFoundException(`Provider "${defaultProviderName}" not found`);
    }

    return provider;
  }

  getAllProviders(): Array<{
    name: string;
    isConfigured: boolean;
    capabilities: any;
  }> {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      isConfigured: p.isConfigured(),
      capabilities: p.capabilities,
    }));
  }
}
