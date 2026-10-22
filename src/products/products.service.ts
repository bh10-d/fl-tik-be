import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LinkProductDto } from './dto/link-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(shopId?: string) {
    return this.prisma.product.findMany({
      where: shopId ? { shopId } : undefined,
      include: {
        shop: {
          select: { id: true, name: true, market: true, shopUrl: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        shop: true,
        videoAssociations: {
          include: {
            video: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product "${id}" not found`);
    }

    return product;
  }

  async linkProductToVideo(videoId: string, dto: LinkProductDto) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundException(`Video "${videoId}" not found`);

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException(`Product "${dto.productId}" not found`);

    const association = await this.prisma.videoProductAssociation.upsert({
      where: {
        videoId_productId: {
          videoId,
          productId: dto.productId,
        },
      },
      create: {
        videoId,
        productId: dto.productId,
        evidenceType: dto.evidenceType,
        evidenceSource: dto.evidenceSource,
        confidence: dto.confidence ?? 1.0,
        verifiedAt: new Date(),
      },
      update: {
        evidenceType: dto.evidenceType,
        evidenceSource: dto.evidenceSource,
        confidence: dto.confidence ?? 1.0,
        verifiedAt: new Date(),
      },
    });

    return association;
  }
}

