import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class LinkProductDto {
  @ApiProperty({ description: 'Product ID to link' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ example: 'TAG', description: 'Evidence type (TAG, CAPTION_LINK, AFFILIATE_LINK, MANUAL)' })
  @IsNotEmpty()
  @IsString()
  evidenceType: string;

  @ApiProperty({ example: 'MANUAL_DASHBOARD', description: 'Evidence source' })
  @IsNotEmpty()
  @IsString()
  evidenceSource: string;

  @ApiPropertyOptional({ example: 1.0, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

