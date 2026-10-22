import { Test, TestingModule } from '@nestjs/testing';
import { ImportsService } from './imports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImportsService', () => {
  let service: ImportsService;

  const mockPrisma = {
    importBatch: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    influencer: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    influencerMetricSnapshot: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
    jest.clearAllMocks();
  });

  it('should preview a valid CSV buffer without saving to database', async () => {
    const csvContent = `Nickname,Unique Id,Contact Email,Followers,Likes,Product Category,Sales,GMV($),Related Videos,Views,Related Lives,Views,View More
Miami Skincare,@glow_miami,contact@glow.com,480K,3.2M,Beauty,340,"$12,500.50",15,450000,2,30000,https://echotik.live/creator/glow_miami`;

    const mockFile: Express.Multer.File = {
      buffer: Buffer.from(csvContent),
      originalname: 'test.csv',
      mimetype: 'text/csv',
      fieldname: 'file',
      encoding: 'utf-8',
      size: csvContent.length,
      stream: null as any,
      destination: '',
      filename: 'test.csv',
      path: '',
    };

    const result = await service.previewFile(mockFile);

    expect(result.filename).toBe('test.csv');
    expect(result.validRowCount).toBe(1);
    expect(result.preview[0].username).toBe('glow_miami');
    expect(result.preview[0].followers).toBe(480000);
    expect(result.preview[0].gmv).toBe(12500.5);

    // Database should NOT be touched during preview
    expect(mockPrisma.influencer.create).not.toHaveBeenCalled();
    expect(mockPrisma.importBatch.create).not.toHaveBeenCalled();
  });

  it('should execute import, create batch, upsert influencers and record metric snapshots', async () => {
    const csvContent = `Nickname,Unique Id,Contact Email,Followers,Likes,Product Category,Sales,GMV($),Related Videos,Views,Related Lives,Views,View More
Creator A,@creator_a,Only in Enterprise plan,100K,500K,Beauty,100,"$5,000",5,100000,0,0,url`;

    const mockFile: Express.Multer.File = {
      buffer: Buffer.from(csvContent),
      originalname: 'import_test.csv',
      mimetype: 'text/csv',
      fieldname: 'file',
      encoding: 'utf-8',
      size: csvContent.length,
      stream: null as any,
      destination: '',
      filename: 'import_test.csv',
      path: '',
    };

    mockPrisma.importBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockPrisma.influencer.findUnique.mockResolvedValue(null); // new creator
    mockPrisma.influencer.create.mockResolvedValue({ id: 'inf-created-1' });
    mockPrisma.influencerMetricSnapshot.create.mockResolvedValue({ id: 'snap-1' });
    mockPrisma.importBatch.update.mockResolvedValue({
      id: 'batch-1',
      status: 'COMPLETED',
      totalRows: 1,
      insertedRows: 1,
      updatedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      completedAt: new Date(),
    });

    const result = await service.executeImport(mockFile);

    expect(result.insertedRows).toBe(1);
    expect(result.status).toBe('COMPLETED');
    expect(mockPrisma.influencer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'creator_a',
          normalizedUsername: 'creator_a',
          trackingStatus: 'ACTIVE',
          source: 'ECHOTIK_EXPORT',
        }),
      }),
    );
    expect(mockPrisma.influencerMetricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          influencerId: 'inf-created-1',
          source: 'ECHOTIK_EXPORT',
          followers: BigInt(100000),
          gmv: 5000,
        }),
      }),
    );
  });
});
