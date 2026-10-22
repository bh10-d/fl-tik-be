import { Module } from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideosController, InfluencerVideosController } from './videos.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  controllers: [VideosController, InfluencerVideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}

