import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export enum AuthType {
  NONE = 'NONE',
  BEARER = 'BEARER',
  API_KEY = 'API_KEY',
  CUSTOM_HEADER = 'CUSTOM_HEADER',
}

export enum ProxyProtocol {
  HTTP = 'HTTP',
  HTTPS = 'HTTPS',
  SOCKS5 = 'SOCKS5',
}

export class UpdateCrawlerConfigDto {
  @ApiPropertyOptional({ description: 'Whether the internal TikTok crawler API is enabled' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiProperty({ description: 'Base URL of the internal TikTok crawler API service' })
  @IsNotEmpty({ message: 'Base URL is required' })
  @IsUrl(
    { require_protocol: true, require_tld: false },
    { message: 'Base URL must be a valid HTTP or HTTPS URL' },
  )
  baseUrl!: string;

  @ApiPropertyOptional({
    enum: AuthType,
    default: AuthType.NONE,
    description: 'Authentication method used by the crawler API',
  })
  @IsOptional()
  @IsEnum(AuthType)
  authType?: AuthType;

  @ApiPropertyOptional({
    description: 'Custom header name if using API_KEY or CUSTOM_HEADER (e.g. x-api-key)',
    example: 'x-api-key',
  })
  @IsOptional()
  @IsString()
  headerName?: string;

  @ApiPropertyOptional({
    description:
      'API key or Bearer token. Leave empty to keep existing configured secret unchanged.',
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Timeout in milliseconds for crawler requests (default 15000ms)',
    example: 15000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs?: number;

  @ApiPropertyOptional({
    description: 'Additional custom configuration attributes for the internal crawler',
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}

export class UpdateProxyConfigDto {
  @ApiProperty({ description: 'Whether the residential proxy is enabled for the internal crawler' })
  @IsBoolean()
  isEnabled!: boolean;

  @ApiPropertyOptional({
    enum: ProxyProtocol,
    default: ProxyProtocol.HTTP,
    description: 'Proxy protocol type',
  })
  @IsOptional()
  @IsEnum(ProxyProtocol)
  protocol?: ProxyProtocol;

  @ApiPropertyOptional({ description: 'Proxy host address or IP', example: 'p.webshare.io' })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional({ description: 'Proxy port number', example: 22225 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ description: 'Proxy authentication username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description:
      'Proxy authentication password. Leave empty to preserve existing configured password.',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: 'Geographic region or label (e.g. US, US-Residential)',
    default: 'US',
  })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Optional operational notes regarding proxy provider' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCollectionPolicyDto {
  @ApiPropertyOptional({
    description: 'Selected primary provider for automatic background collection',
    example: 'INTERNAL_CRAWLER',
  })
  @IsOptional()
  @IsIn(['INTERNAL_CRAWLER', 'MOCK'])
  activeProvider?: 'INTERNAL_CRAWLER' | 'MOCK';

  @ApiPropertyOptional({
    description: 'Global collection kill switch. When false, stops all collection jobs.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isCollectionActive?: boolean;

  @ApiPropertyOptional({
    description: 'Target polling interval in minutes (default 15 minutes)',
    example: 15,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  pollIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Max concurrent influencer checks',
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrentJobs?: number;
}

export class TestConnectionResponseDto {
  @ApiProperty({ example: 'INTERNAL_CRAWLER' })
  provider!: string;

  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: 85, description: 'Round-trip latency in milliseconds' })
  latencyMs!: number;

  @ApiProperty({ example: 'Connection established successfully' })
  message!: string;

  @ApiPropertyOptional({ description: 'Safe diagnostic metadata without exposing secrets' })
  diagnostics?: Record<string, any>;
}

export class DataSourceStatusDto {
  @ApiProperty({ example: 'INTERNAL_CRAWLER' })
  activeProvider!: string;

  @ApiProperty({ example: true, description: 'Global kill switch status' })
  isCollectionActive!: boolean;

  @ApiProperty({ example: 15, description: 'Polling interval in minutes' })
  pollIntervalMinutes!: number;

  @ApiProperty({ description: 'Provider status list' })
  providers!: Array<{
    provider: string;
    isEnabled: boolean;
    isConfigured: boolean;
    status: string;
    lastTestedAt?: string | null;
    lastTestStatus?: string | null;
    lastSuccessfulRequestAt?: string | null;
    lastError?: string | null;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
  }>;

  @ApiProperty({ description: 'Proxy configuration status' })
  proxy!: {
    isEnabled: boolean;
    isConfigured: boolean;
    protocol: string;
    host?: string | null;
    port?: number | null;
    region?: string | null;
    lastTestedAt?: string | null;
    lastTestStatus?: string | null;
    ownershipNote: string;
  };

  @ApiProperty({ description: 'Collection operational metrics' })
  collectionMetrics!: {
    lastCollectionAttemptAt?: string | null;
    lastSuccessfulCollectionAt?: string | null;
    recentFailureCount: number;
    lastError?: string | null;
  };
}

