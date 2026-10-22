import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.configService.get<number>('REDIS_PORT', 6379)),
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
  }

  async checkHealth() {
    let databaseStatus = 'DOWN';
    let redisStatus = 'DOWN';
    let dbLatencyMs = 0;
    let redisLatencyMs = 0;

    // Check PostgreSQL
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      databaseStatus = 'UP';
    } catch (err: any) {
      this.logger.error(`Database health check failed: ${err.message}`);
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const pong = await this.redis.ping();
      redisLatencyMs = Date.now() - redisStart;
      if (pong === 'PONG') {
        redisStatus = 'UP';
      }
    } catch (err: any) {
      this.logger.error(`Redis health check failed: ${err.message}`);
    }

    const isHealthy = databaseStatus === 'UP' && redisStatus === 'UP';

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: databaseStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          status: redisStatus,
          latencyMs: redisLatencyMs,
        },
      },
      uptime: process.uptime(),
    };
  }
}

