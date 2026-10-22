import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportPreviewItemDto {
  @ApiProperty()
  rowNumber: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  email: string | null;

  @ApiPropertyOptional()
  followers: number | null;

  @ApiPropertyOptional()
  likes: number | null;

  @ApiPropertyOptional()
  category: string | null;

  @ApiPropertyOptional()
  sales: number | null;

  @ApiPropertyOptional()
  gmv: number | null;

  @ApiPropertyOptional()
  videoViews: number | null;

  @ApiPropertyOptional()
  liveViews: number | null;

  @ApiProperty()
  isValid: boolean;

  @ApiPropertyOptional()
  validationError?: string;
}

export class ImportPreviewResponseDto {
  @ApiProperty()
  filename: string;

  @ApiProperty()
  headerRowIndex: number;

  @ApiProperty({ type: [String] })
  detectedHeaders: string[];

  @ApiProperty()
  totalRows: number;

  @ApiProperty()
  validRowCount: number;

  @ApiProperty()
  invalidRowCount: number;

  @ApiProperty({ type: [ImportPreviewItemDto] })
  preview: ImportPreviewItemDto[];

  @ApiProperty({ type: [ImportPreviewItemDto] })
  errors: ImportPreviewItemDto[];
}

export class ImportExecuteResponseDto {
  @ApiProperty()
  importId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  totalRows: number;

  @ApiProperty()
  insertedRows: number;

  @ApiProperty()
  updatedRows: number;

  @ApiProperty()
  skippedRows: number;

  @ApiProperty()
  failedRows: number;

  @ApiProperty()
  completedAt: string;
}

