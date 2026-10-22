import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { ImportsService } from './imports.service';
import {
  ImportExecuteResponseDto,
  ImportPreviewResponseDto,
} from './dto/import-dtos';

@ApiTags('Imports')
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('influencers/preview')
  @ApiOperation({ summary: 'Preview an EchoTik Excel or CSV import file before saving' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: ImportPreviewResponseDto })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async preview(@UploadedFile() file: Express.Multer.File): Promise<ImportPreviewResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.importsService.previewFile(file);
  }

  @Post('influencers')
  @ApiOperation({ summary: 'Execute an EchoTik Excel or CSV import and commit to database' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: ImportExecuteResponseDto })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async execute(@UploadedFile() file: Express.Multer.File): Promise<ImportExecuteResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.importsService.executeImport(file);
  }

  @Get(':importId')
  @ApiOperation({ summary: 'Get details and summary of an import batch' })
  async getBatch(@Param('importId') importId: string) {
    return this.importsService.getImportBatch(importId);
  }

  @Get(':importId/errors')
  @ApiOperation({ summary: 'Get row-level errors for an import batch (JSON or CSV)' })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], required: false })
  async getErrors(
    @Param('importId') importId: string,
    @Query('format') format: 'json' | 'csv' = 'json',
    @Res() res: Response,
  ) {
    const result = await this.importsService.getImportErrors(importId, format);
    if (format === 'csv' && 'csvData' in result) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.status(HttpStatus.OK).send(result.csvData);
    }
    return res.status(HttpStatus.OK).json(result);
  }
}
