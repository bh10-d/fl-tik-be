import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { DataSourcesController } from './data-sources.controller';
import { DataSourcesService } from './data-sources.service';
import { ProxyConfigurationService } from './services/proxy-configuration.service';
import { CollectionPolicyService } from './services/collection-policy.service';

@Module({
  imports: [ConfigModule, PrismaModule, ProvidersModule],
  controllers: [DataSourcesController],
  providers: [
    DataSourcesService,
    ProxyConfigurationService,
    CollectionPolicyService,
  ],
  exports: [
    DataSourcesService,
    ProxyConfigurationService,
    CollectionPolicyService,
  ],
})
export class DataSourcesModule {}
