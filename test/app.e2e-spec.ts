import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import * as path from 'path';

describe('Influencer Monitor API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health - should return healthy status for Postgres and Redis', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.components.database.status).toBe('UP');
    expect(res.body.components.redis.status).toBe('UP');
  });

  it('GET /api/v1/influencers - should return paginated influencers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/influencers?page=1&limit=5')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(5);
  });

  it('GET /api/v1/videos - should return paginated video records', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/videos?page=1&limit=5')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/v1/videos/recent - should return recent discovered videos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/videos/recent?limit=5')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/v1/dashboard/overview - should return platform KPI metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .expect(200);

    expect(res.body).toHaveProperty('totalCreators');
    expect(res.body).toHaveProperty('activeTrackedCreators');
    expect(res.body).toHaveProperty('totalVideosTracked');
    expect(res.body).toHaveProperty('newVideos24h');
    expect(res.body).toHaveProperty('totalViews');
  });

  it('GET /api/v1/dashboard/publishing-trends - should return publishing vs detected trends', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/publishing-trends?days=7')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(7);
  });

  it('GET /api/v1/tracking/jobs - should return tracking job history', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tracking/jobs')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/v1/imports/influencers/preview - should preview the 100-row EchoTik XLSX file', async () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/echotik_influencer_export.xlsx');

    const res = await request(app.getHttpServer())
      .post('/api/v1/imports/influencers/preview')
      .attach('file', fixturePath)
      .expect(200);

    expect(res.body.filename).toBe('echotik_influencer_export.xlsx');
    expect(res.body.totalRows).toBe(100);
    expect(res.body.validRowCount).toBe(100);
    expect(res.body.preview.length).toBeGreaterThan(0);
  });
});
