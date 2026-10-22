import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const port = process.env.PORT || 3000;
  const corsOriginsEnv = process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000';
  const corsOrigins = corsOriginsEnv.split(',').map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (corsOrigins.indexOf(origin) !== -1 || corsOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(null, true); // Dev convenience
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,x-api-key',
  });

  // Canonical API prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Influencer Monitor API')
    .setDescription(
      'TikTok Shop US influencer intelligence and video monitoring platform REST API.\n' +
      'Versioned prefix: `/api/v1`\n' +
      'Supports EchoTik imports, creator tracking, video discovery, metrics history, and provider adapters.',
    )
    .setVersion('1.0')
    .addTag('Influencers', 'Creator tracking and management')
    .addTag('Videos', 'Video discovery, metrics, and feed')
    .addTag('Imports', 'EchoTik Excel and CSV import processing')
    .addTag('Tracking', 'Background synchronization and BullMQ monitoring')
    .addTag('Dashboard', 'Real aggregates, trends, and platform overview')
    .addTag('Shops', 'Competitor shops and intelligence')
    .addTag('Products', 'Shop products and video associations')
    .addTag('Health', 'Readiness and liveness checks for PostgreSQL and Redis')
    .addTag('Auth', 'TikTok Display API OAuth integration')
    .addTag('Data Sources & Proxy', 'Unified TikTok crawler, proxy, and provider configuration')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(port);
  logger.log(`Influencer Monitor Backend running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
