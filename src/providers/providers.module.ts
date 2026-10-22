import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MockVideoProvider } from './mock/mock-video.provider';
import { TikTokDisplayProvider } from './tiktok-display/tiktok-display.provider';
import { ExternalVideoProvider } from './external-video-provider/external-video.provider';
import { CrawlerApiProvider } from '../data-sources/providers/crawler-api.provider';
import { ProviderRegistryService } from './provider-registry.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    MockVideoProvider,
    TikTokDisplayProvider,
    ExternalVideoProvider,
    CrawlerApiProvider,
    ProviderRegistryService,
  ],
  exports: [
    MockVideoProvider,
    TikTokDisplayProvider,
    ExternalVideoProvider,
    CrawlerApiProvider,
    ProviderRegistryService,
  ],
})
export class ProvidersModule {}
