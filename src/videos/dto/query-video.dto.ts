import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryVideoDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by creator ID' })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiPropertyOptional({ description: 'Filter by creator username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Search term matching video caption or creator name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Published after timestamp (ISO)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAfter?: Date;

  @ApiPropertyOptional({ description: 'Published before timestamp (ISO)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedBefore?: Date;

  @ApiPropertyOptional({ description: 'First seen/detected after timestamp (ISO)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  firstSeenAfter?: Date;

  @ApiPropertyOptional({ description: 'First seen/detected before timestamp (ISO)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  firstSeenBefore?: Date;

  @ApiPropertyOptional({ description: 'Filter by linked Shop ID' })
  @IsOptional()
  @IsString()
  shopId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked Product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter newly detected videos (within 24 hours)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isNew?: boolean;

  @ApiPropertyOptional({ description: 'Minimum view count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minViews?: number;

  @ApiPropertyOptional({ description: 'Maximum view count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxViews?: number;

  @ApiPropertyOptional({ description: 'Minimum like count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minLikes?: number;

  @ApiPropertyOptional({ description: 'Filter by provider (MOCK, TIKTOK_DISPLAY, EXTERNAL)' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Filter by data source' })
  @IsOptional()
  @IsString()
  dataSource?: string;
}

