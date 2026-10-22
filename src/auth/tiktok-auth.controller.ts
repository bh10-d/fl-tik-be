import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { TikTokDisplayProvider } from '../providers/tiktok-display/tiktok-display.provider';

@ApiTags('Auth')
@Controller('auth/tiktok')
export class TikTokAuthController {
  constructor(private readonly tiktokProvider: TikTokDisplayProvider) {}

  @Get('authorize')
  @ApiOperation({ summary: 'Initiate TikTok Display API OAuth authorization redirect' })
  @ApiQuery({ name: 'state', required: false })
  authorize(@Query('state') state = 'default_state', @Res() res: Response) {
    const authUrl = this.tiktokProvider.getAuthorizationUrl(state);
    return res.redirect(authUrl);
  }

  @Get('callback')
  @ApiOperation({ summary: 'TikTok OAuth callback handling and token exchange' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: false })
  async callback(@Query('code') code: string, @Query('state') state: string) {
    const tokenData = await this.tiktokProvider.exchangeCodeForToken(code);
    return {
      success: true,
      openId: tokenData.openId,
      expiresIn: tokenData.expiresIn,
      message: 'TikTok creator successfully authorized',
    };
  }
}

