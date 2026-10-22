import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateInfluencerDto {
  @ApiProperty({ example: 'glow_miami' })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiPropertyOptional({ example: 'Miami Skincare Lab' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Beauty & Skincare' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 480000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  followers?: number;

  @ApiPropertyOptional({ example: 'https://www.tiktok.com/@glow_miami' })
  @IsOptional()
  @IsString()
  profileUrl?: string;
}

