import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ShopsService } from './shops.service';

@ApiTags('Shops')
@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all competitor shops' })
  findAll() {
    return this.shopsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shop details by ID' })
  findOne(@Param('id') id: string) {
    return this.shopsService.findOne(id);
  }
}

