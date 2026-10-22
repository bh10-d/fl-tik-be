import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { TrackingService } from './tracking.service';
import { TrackingProcessor } from './tracking.processor';
import { TrackingScheduler } from './tracking.scheduler';
import { TrackingController, InfluencerSyncController } from './tracking.controller';
import { ProvidersModule } from '../providers/providers.module';
import { DataSourcesModule } from '../data-sources/data-sources.module';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'tracking-queue',
    }),
    ProvidersModule,
    forwardRef(() => DataSourcesModule),
  ],
  controllers: [TrackingController, InfluencerSyncController],
  providers: [TrackingService, TrackingProcessor, TrackingScheduler],
  exports: [TrackingService],
})
export class TrackingModule {}


