import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { ImportsModule } from './imports/imports.module';
import { InfluencersModule } from './influencers/influencers.module';
import { VideosModule } from './videos/videos.module';
import { TrackingModule } from './tracking/tracking.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ShopsModule } from './shops/shops.module';
import { ProductsModule } from './products/products.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { DataSourcesModule } from './data-sources/data-sources.module';
import { IntelligenceModule } from './intelligence/intelligence.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<number>('REDIS_PORT', 6379)),
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    ProvidersModule,
    DataSourcesModule,
    IntelligenceModule,
    ImportsModule,
    InfluencersModule,
    VideosModule,
    TrackingModule,
    DashboardModule,
    ShopsModule,
    ProductsModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
