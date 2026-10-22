import { PartialType } from '@nestjs/swagger';
import { CreateInfluencerDto } from './create-influencer.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateInfluencerDto extends PartialType(CreateInfluencerDto) {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'active', 'paused'] })
  @IsOptional()
  @IsString()
  trackingStatus?: string;
}

