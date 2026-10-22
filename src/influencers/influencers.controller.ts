import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InfluencersService } from './influencers.service';
import { CreateInfluencerDto } from './dto/create-influencer.dto';
import { UpdateInfluencerDto } from './dto/update-influencer.dto';
import { QueryInfluencerDto } from './dto/query-influencer.dto';
import { BulkInfluencerIdsDto } from './dto/bulk-status.dto';

@ApiTags('Influencers')
@Controller('influencers')
export class InfluencersController {
  constructor(private readonly influencersService: InfluencersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new influencer to track' })
  @ApiResponse({ status: 201, description: 'Influencer created successfully' })
  create(@Body() createDto: CreateInfluencerDto) {
    return this.influencersService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get paginated list of influencers with search and filters' })
  findAll(@Query() query: QueryInfluencerDto) {
    return this.influencersService.findAll(query);
  }

  @Post('bulk-track')
  @ApiOperation({ summary: 'Bulk resume tracking for selected influencers' })
  bulkTrack(@Body() dto: BulkInfluencerIdsDto) {
    return this.influencersService.bulkSetTrackingStatus(dto.ids, 'ACTIVE');
  }

  @Post('bulk-pause')
  @ApiOperation({ summary: 'Bulk pause tracking for selected influencers' })
  bulkPause(@Body() dto: BulkInfluencerIdsDto) {
    return this.influencersService.bulkSetTrackingStatus(dto.ids, 'PAUSED');
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Bulk delete selected influencers' })
  bulkDelete(@Body() dto: BulkInfluencerIdsDto) {
    return this.influencersService.bulkRemove(dto.ids);
  }

  @Get('dormant-summary')
  @ApiOperation({ summary: 'Get summary of dormant influencers based on inactivity threshold' })
  getDormantSummary(@Query('days') days?: number) {
    return this.influencersService.getDormantSummary(days ? Number(days) : 180);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get influencer details by ID including recent videos and metric snapshots' })
  findOne(@Param('id') id: string) {
    return this.influencersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an influencer profile or settings' })
  update(@Param('id') id: string, @Body() updateDto: UpdateInfluencerDto) {
    return this.influencersService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an influencer from tracking' })
  remove(@Param('id') id: string) {
    return this.influencersService.remove(id);
  }

  @Post(':id/track')
  @ApiOperation({ summary: 'Resume active tracking for an influencer' })
  track(@Param('id') id: string) {
    return this.influencersService.setTrackingStatus(id, 'ACTIVE');
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause tracking for an influencer' })
  pause(@Param('id') id: string) {
    return this.influencersService.setTrackingStatus(id, 'PAUSED');
  }
}

