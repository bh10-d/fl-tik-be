import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController, VideoProductLinkController } from './products.controller';

@Module({
  controllers: [ProductsController, VideoProductLinkController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

