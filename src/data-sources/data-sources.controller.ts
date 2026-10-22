import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { DataSourcesService } from './data-sources.service';
import { CollectionPolicyService } from './services/collection-policy.service';
import {
  UpdateCrawlerConfigDto,
  UpdateProxyConfigDto,
  UpdateCollectionPolicyDto,
  TestConnectionResponseDto,
  DataSourceStatusDto,
} from './dto/data-source.dto';

@ApiTags('Data Sources & Proxy')
@Controller('data-sources')
export class DataSourcesController {
  constructor(
    private readonly dataSourcesService: DataSourcesService,
    private readonly collectionPolicyService: CollectionPolicyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get all data source configurations, proxy settings, and collection policies',
    description:
      'Returns metadata and masked credentials. Raw API keys and passwords are never returned.',
  })
  async getAllDataSources() {
    return this.dataSourcesService.getAllDataSources();
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get lightweight operational status of all providers and collection kill switch',
  })
  @ApiResponse({ status: 200, type: DataSourceStatusDto })
  async getStatus() {
    return this.dataSourcesService.getStatus();
  }

  @Put('collection-policy')
  @ApiOperation({
    summary: 'Update collection policy and scheduling interval',
    description:
      'Configures the active collection provider, polling interval, and concurrency.',
  })
  async updateCollectionPolicy(@Body() dto: UpdateCollectionPolicyDto) {
    await this.collectionPolicyService.updatePolicy(dto);
    return this.dataSourcesService.getAllDataSources();
  }

  @Post('collection/stop')
  @ApiOperation({
    summary: 'Engage global collection kill switch',
    description:
      'Immediately stops all background collection and prevents queued jobs from making outbound requests.',
  })
  async stopCollection(@Body('reason') reason?: string) {
    await this.collectionPolicyService.stopCollection(reason);
    return this.dataSourcesService.getAllDataSources();
  }

  @Post('collection/start')
  @ApiOperation({
    summary: 'Disengage global collection kill switch and resume background collection',
  })
  async startCollection() {
    await this.collectionPolicyService.startCollection();
    return this.dataSourcesService.getAllDataSources();
  }

  @Put(':provider/config')
  @ApiOperation({
    summary: 'Update configuration for a specific provider (crawler or proxy)',
    description:
      'Encrypted server-side. Saving configuration updates credentials without triggering collection.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['crawler', 'proxy'],
    description: 'Target provider identifier',
  })
  async updateProviderConfig(
    @Param('provider') provider: string,
    @Body() body: any,
  ) {
    const normalized = provider.toLowerCase().replace('_', '-');

    if (normalized === 'crawler' || normalized === 'internal-crawler') {
      const dto = Object.assign(new UpdateCrawlerConfigDto(), body);
      return this.dataSourcesService.updateCrawlerConfig(dto);
    }

    if (normalized === 'proxy') {
      const dto = Object.assign(new UpdateProxyConfigDto(), body);
      return this.dataSourcesService.updateProxyConfig(dto);
    }

    throw new BadRequestException(
      `Unsupported provider "${provider}". Expected: crawler or proxy`,
    );
  }

  @Post(':provider/test-connection')
  @ApiOperation({
    summary: 'Perform an isolated connection test for a provider or proxy',
    description:
      'Only tests connectivity to the target provider. Never triggers scraping or sync jobs.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['crawler', 'proxy'],
  })
  @ApiResponse({ status: 200, type: TestConnectionResponseDto })
  async testConnection(@Param('provider') provider: string) {
    return this.dataSourcesService.testConnection(provider);
  }
}

