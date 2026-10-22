import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackingJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  creatorId: string;

  @ApiProperty()
  creatorUsername: string;

  @ApiProperty()
  creatorDisplayName: string;

  @ApiProperty()
  creatorAvatarUrl: string;

  @ApiProperty()
  lastCheckedAt: string;

  @ApiPropertyOptional()
  latestPublishedAt: string | null;

  @ApiPropertyOptional()
  latestDetectedAt: string | null;

  @ApiProperty()
  newVideoCount: number;

  @ApiProperty({ enum: ['completed', 'running', 'failed', 'paused'] })
  status: 'completed' | 'running' | 'failed' | 'paused';

  @ApiProperty()
  nextScheduledAt: string;

  @ApiPropertyOptional()
  failureReason?: string | null;
}

