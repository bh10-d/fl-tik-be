import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryInfluencerDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search term matching username or display name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by tracking status (active, paused, error, provider_unavailable)' })
  @IsOptional()
  @IsString()
  trackingStatus?: string;

  @ApiPropertyOptional({
    description:
      'Filter by latest video activity: recent_30d, dormant_30d, dormant_60d, dormant_90d, dormant_180d, no_videos',
  })
  @IsOptional()
  @IsString()
  lastVideoFilter?: string;

  @ApiPropertyOptional({ description: 'Minimum follower count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minFollowers?: number;

  @ApiPropertyOptional({ description: 'Maximum follower count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxFollowers?: number;
}

