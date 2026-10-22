import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.shop.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            _count: {
              select: { videoAssociations: true },
            },
          },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop "${id}" not found`);
    }

    return shop;
  }
}

