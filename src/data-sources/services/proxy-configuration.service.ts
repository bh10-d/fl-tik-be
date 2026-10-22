import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProxyConfigDto, TestConnectionResponseDto } from '../dto/data-source.dto';
import { encryptSecret, decryptSecret, maskSecret } from '../crypto.util';
import * as net from 'net';

@Injectable()
export class ProxyConfigurationService {
  private readonly logger = new Logger(ProxyConfigurationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve proxy configuration safe for UI presentation (with masked password)
   */
  async getSafeProxyConfig() {
    let config = await this.prisma.proxyConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config) {
      config = await this.prisma.proxyConfig.create({
        data: {
          id: 'default',
          isEnabled: false,
          protocol: 'HTTP',
          region: 'US',
          notes: 'US Residential Proxy for TikTok Crawler Service',
        },
      });
    }

    const isConfigured = Boolean(config.host && config.port);

    return {
      id: config.id,
      isEnabled: config.isEnabled,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      username: config.username,
      maskedPassword: config.maskedPassword || (config.encryptedPassword ? '••••••••' : null),
      isConfigured,
      region: config.region,
      notes: config.notes,
      lastTestedAt: config.lastTestedAt?.toISOString() || null,
      lastTestStatus: config.lastTestStatus,
      lastTestError: config.lastTestError,
      ownershipNote:
        'Outbound TikTok requests and residential proxy sessions are managed by the separately hosted internal crawler service. The Influencer Monitor backend communicates directly with the crawler API.',
    };
  }

  /**
   * Retrieve decrypted credentials strictly for passing to the internal crawler service if requested.
   * This is never returned to the frontend or exposed to other providers.
   */
  async getInternalCrawlerProxySettings(): Promise<{
    enabled: boolean;
    protocol: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    region?: string;
  } | null> {
    const config = await this.prisma.proxyConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config || !config.isEnabled || !config.host || !config.port) {
      return null;
    }

    const decryptedPassword = config.encryptedPassword
      ? decryptSecret(config.encryptedPassword)
      : undefined;

    return {
      enabled: config.isEnabled,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      username: config.username || undefined,
      password: decryptedPassword,
      region: config.region || 'US',
    };
  }

  /**
   * Update proxy settings
   */
  async updateConfig(dto: UpdateProxyConfigDto) {
    const existing = await this.prisma.proxyConfig.findUnique({
      where: { id: 'default' },
    });

    let encryptedPassword = existing?.encryptedPassword;
    let maskedPassword = existing?.maskedPassword;

    if (dto.password !== undefined) {
      if (dto.password.trim().length > 0) {
        encryptedPassword = encryptSecret(dto.password);
        maskedPassword = maskSecret(dto.password);
      } else {
        encryptedPassword = null;
        maskedPassword = null;
      }
    }

    const updated = await this.prisma.proxyConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        isEnabled: dto.isEnabled,
        protocol: dto.protocol || 'HTTP',
        host: dto.host,
        port: dto.port,
        username: dto.username,
        encryptedPassword,
        maskedPassword,
        region: dto.region || 'US',
        notes: dto.notes,
      },
      update: {
        isEnabled: dto.isEnabled,
        protocol: dto.protocol || 'HTTP',
        host: dto.host !== undefined ? dto.host : existing?.host,
        port: dto.port !== undefined ? dto.port : existing?.port,
        username: dto.username !== undefined ? dto.username : existing?.username,
        encryptedPassword,
        maskedPassword,
        region: dto.region !== undefined ? dto.region : existing?.region,
        notes: dto.notes !== undefined ? dto.notes : existing?.notes,
      },
    });

    this.logger.log(`Proxy configuration updated (enabled: ${updated.isEnabled}, host: ${updated.host || 'unset'})`);
    return this.getSafeProxyConfig();
  }

  /**
   * Test connection to the configured proxy gateway socket
   */
  async testConnection(): Promise<TestConnectionResponseDto> {
    const config = await this.prisma.proxyConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config || !config.host || !config.port) {
      return {
        provider: 'PROXY',
        success: false,
        statusCode: 400,
        latencyMs: 0,
        message: 'Proxy host and port must be configured before testing',
      };
    }

    const startTime = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(4000);

        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error(`Connection to ${config.host}:${config.port} timed out after 4000ms`));
        });

        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });

        socket.connect(config.port!, config.host!);
      });

      const latency = Date.now() - startTime;

      await this.prisma.proxyConfig.update({
        where: { id: 'default' },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: 'SUCCESS',
          lastTestError: null,
        },
      });

      return {
        provider: 'PROXY',
        success: true,
        statusCode: 200,
        latencyMs: latency,
        message: `Proxy server ${config.host}:${config.port} is reachable`,
        diagnostics: {
          protocol: config.protocol,
          host: config.host,
          port: config.port,
          region: config.region,
          hasAuth: Boolean(config.username),
          latencyMs: latency,
          note: 'Socket reachability verified. TikTok access depends on provider IP reputation.',
        },
      };
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const errorMsg = err.message || 'Failed to establish socket connection to proxy server';

      await this.prisma.proxyConfig.update({
        where: { id: 'default' },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: 'FAILED',
          lastTestError: errorMsg,
        },
      });

      return {
        provider: 'PROXY',
        success: false,
        statusCode: 502,
        latencyMs: latency,
        message: `Proxy connectivity check failed: ${errorMsg}`,
        diagnostics: {
          host: config.host,
          port: config.port,
          protocol: config.protocol,
        },
      };
    }
  }
}

