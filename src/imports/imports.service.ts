import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EchoTikParser, ParsedInfluencerRow } from './parsers/echotik.parser';
import {
  ImportExecuteResponseDto,
  ImportPreviewItemDto,
  ImportPreviewResponseDto,
} from './dto/import-dtos';
import { stringify } from 'csv-stringify/sync';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Preview an import without writing records to the database
   */
  async previewFile(file: Express.Multer.File): Promise<ImportPreviewResponseDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    try {
      const parsed = EchoTikParser.parse(file.buffer, file.originalname);

      const previewItems: ImportPreviewItemDto[] = parsed.validRows.slice(0, 20).map((r) => ({
        rowNumber: r.rowNumber,
        username: r.normalizedUsername,
        displayName: r.displayName,
        email: r.email,
        followers: r.followers,
        likes: r.likes,
        category: r.category,
        sales: r.sales,
        gmv: r.gmv,
        videoViews: r.videoViews,
        liveViews: r.liveViews,
        isValid: r.isValid,
      }));

      const errorItems: ImportPreviewItemDto[] = parsed.invalidRows.map((r) => ({
        rowNumber: r.rowNumber,
        username: r.rawUsername,
        displayName: r.displayName,
        email: r.email,
        followers: r.followers,
        likes: r.likes,
        category: r.category,
        sales: r.sales,
        gmv: r.gmv,
        videoViews: r.videoViews,
        liveViews: r.liveViews,
        isValid: false,
        validationError: r.validationError,
      }));

      return {
        filename: file.originalname,
        headerRowIndex: parsed.headerRowIndex,
        detectedHeaders: parsed.headers,
        totalRows: parsed.totalRows,
        validRowCount: parsed.validRows.length,
        invalidRowCount: parsed.invalidRows.length,
        preview: previewItems,
        errors: errorItems,
      };
    } catch (err: any) {
      this.logger.error(`Import preview failed: ${err.message}`);
      throw new BadRequestException(`Failed to parse file: ${err.message}`);
    }
  }

  /**
   * Execute import transactionally and record metric snapshots and import batch
   */
  async executeImport(file: Express.Multer.File): Promise<ImportExecuteResponseDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    const parsed = EchoTikParser.parse(file.buffer, file.originalname);

    const batch = await this.prisma.importBatch.create({
      data: {
        filename: file.originalname,
        source: 'ECHOTIK_EXPORT',
        status: 'PROCESSING',
        totalRows: parsed.totalRows,
      },
    });

    let insertedRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let failedRows = parsed.invalidRows.length;

    const rowErrors: Array<{ rowNumber: number; username: string; error: string }> = [
      ...parsed.invalidRows.map((r) => ({
        rowNumber: r.rowNumber,
        username: r.rawUsername,
        error: r.validationError || 'Invalid row',
      })),
    ];

    const seenInFile = new Set<string>();

    for (const row of parsed.validRows) {
      if (seenInFile.has(row.normalizedUsername)) {
        skippedRows++;
        continue;
      }
      seenInFile.add(row.normalizedUsername);

      try {
        const existing = await this.prisma.influencer.findUnique({
          where: { normalizedUsername: row.normalizedUsername },
        });

        let influencerId: string;

        if (existing) {
          const updated = await this.prisma.influencer.update({
            where: { id: existing.id },
            data: {
              displayName: row.displayName || existing.displayName,
              followers: row.followers ? BigInt(row.followers) : existing.followers,
              likes: row.likes ? BigInt(row.likes) : existing.likes,
              category: row.category || existing.category,
            },
          });
          influencerId = updated.id;
          updatedRows++;
        } else {
          const created = await this.prisma.influencer.create({
            data: {
              username: row.normalizedUsername,
              normalizedUsername: row.normalizedUsername,
              displayName: row.displayName,
              profileUrl: row.profileUrl,
              followers: row.followers ? BigInt(row.followers) : null,
              likes: row.likes ? BigInt(row.likes) : null,
              category: row.category,
              trackingStatus: 'ACTIVE',
              source: 'ECHOTIK_EXPORT',
            },
          });
          influencerId = created.id;
          insertedRows++;
        }

        // Record historical snapshot for EchoTik imported metrics
        await this.prisma.influencerMetricSnapshot.create({
          data: {
            influencerId,
            source: 'ECHOTIK_EXPORT',
            followers: row.followers ? BigInt(row.followers) : null,
            likes: row.likes ? BigInt(row.likes) : null,
            sales: row.sales ? BigInt(row.sales) : null,
            gmv: row.gmv,
          },
        });
      } catch (err: any) {
        this.logger.error(`Row ${row.rowNumber} failed import: ${err.message}`);
        failedRows++;
        rowErrors.push({
          rowNumber: row.rowNumber,
          username: row.normalizedUsername,
          error: err.message,
        });
      }
    }

    const completed = await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: failedRows > 0 && insertedRows === 0 && updatedRows === 0 ? 'FAILED' : 'COMPLETED',
        insertedRows,
        updatedRows,
        skippedRows,
        failedRows,
        errors: rowErrors as any,
        completedAt: new Date(),
      },
    });

    return {
      importId: completed.id,
      status: completed.status,
      totalRows: completed.totalRows,
      insertedRows: completed.insertedRows,
      updatedRows: completed.updatedRows,
      skippedRows: completed.skippedRows,
      failedRows: completed.failedRows,
      completedAt: completed.completedAt?.toISOString() || new Date().toISOString(),
    };
  }

  async getImportBatch(importId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: importId },
    });
    if (!batch) {
      throw new NotFoundException(`Import batch "${importId}" not found`);
    }
    return batch;
  }

  async getImportErrors(importId: string, format: 'json' | 'csv' = 'json') {
    const batch = await this.getImportBatch(importId);
    const errors = (batch.errors as any[]) || [];

    if (format === 'csv') {
      const csvData = stringify(errors, {
        header: true,
        columns: ['rowNumber', 'username', 'error'],
      });
      return { csvData, filename: `import-${importId}-errors.csv` };
    }

    return {
      importId: batch.id,
      filename: batch.filename,
      failedRows: batch.failedRows,
      errors,
    };
  }
}

