import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { LinkProductDto } from './dto/link-product.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tracked products' })
  @ApiQuery({ name: 'shopId', required: false })
  findAll(@Query('shopId') shopId?: string) {
    return this.productsService.findAll(shopId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product details by ID' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}

@ApiTags('Videos')
@Controller('videos')
export class VideoProductLinkController {
  constructor(private readonly productsService: ProductsService) {}

  @Post(':id/link-product')
  @ApiOperation({ summary: 'Link a competitor shop product to a video with evidence' })
  linkProduct(@Param('id') videoId: string, @Body() dto: LinkProductDto) {
    return this.productsService.linkProductToVideo(videoId, dto);
  }
}

