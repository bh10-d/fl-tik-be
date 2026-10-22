# Influencer Monitor Backend

Production-oriented backend for **Influencer Monitor**, a TikTok Shop US influencer intelligence and video monitoring platform built with NestJS, PostgreSQL, Prisma ORM, Redis, and BullMQ.

---

## 1. System Architecture

```
[ Frontend: React 19 + Vite ]
             │  /api/v1
             ▼
[ NestJS API Gateway ]
   ├── REST Controllers (/api/v1)
   │     ├── /influencers (CRUD, track, pause, bulk actions)
   │     ├── /videos (feed, multi-criteria filters, metrics)
   │     ├── /imports (EchoTik XLSX/CSV parser, preview & execute)
   │     ├── /tracking (BullMQ jobs history & retry)
   │     ├── /dashboard (aggregates, publishing trends, health)
   │     ├── /shops & /products (competitor intelligence & associations)
   │     └── /health (Postgres & Redis readiness)
   │
   ├── Background Tracking (BullMQ & Redis)
   │     ├── TrackingScheduler (cron polling active creators)
   │     ├── TrackingProcessor (distributed lock, deduplication)
   │     └── EventEmitter (video.discovered internal events)
   │
   ├── Data Providers Abstraction (`CreatorVideoProvider`)
   │     ├── BrightDataVideoProvider (primary TikTok scraper: profiles, posts, metrics)
   │     ├── MockVideoProvider (deterministic local tracking)
   │     ├── TikTokDisplayProvider (official v2 OAuth Display API)
   │     └── ExternalVideoProvider (compliant 3rd-party adapter)
   │
   └── PostgreSQL via Prisma ORM
         ├── influencers & influencer_metric_snapshots
         ├── videos & video_metric_snapshots
         ├── bright_data_jobs (asynchronous scrape progress & snapshots)
         ├── shops & products & video_product_associations
         └── tracking_job_runs & import_batches
```

---

## 2. Technology Stack

- **Runtime & Framework**: NestJS 11, Node.js 22+, TypeScript (strict mode)
- **Database & ORM**: PostgreSQL 15+, Prisma ORM 6.19
- **Queue & Scheduling**: BullMQ, Redis 7, `@nestjs/schedule`
- **Import Engine**: SheetJS (`xlsx`) for `.xlsx`/`.xls`, `csv-parse` & `csv-stringify` for `.csv`
- **Validation & Docs**: `class-validator`, `class-transformer`, Swagger / OpenAPI (`/api/docs`)
- **Testing**: Jest unit and e2e integration tests

---

## 3. Getting Started

### 3.1 Prerequisites

- Node.js >= 20
- PostgreSQL (running locally or in Docker)
- Redis (running locally or in Docker)

A `docker-compose.yml` is provided for convenience:
```bash
docker compose up -d
```

### 3.2 Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment variables:
| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:5432/influencer_monitor?schema=public` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | API server port | `3000` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:5173,http://localhost:3000` |
| `DEFAULT_VIDEO_PROVIDER` | Active provider (`bright_data`, `mock`, `tiktok`, `external`) | `bright_data` |
| `BRIGHTDATA_API_KEY` | Bright Data API Bearer Token (server-side only, never logged) | Optional (Required for live scraping) |
| `BRIGHTDATA_MAX_CONCURRENT_JOBS` | Maximum concurrent scraping requests | `3` |
| `TIKTOK_CLIENT_KEY` | TikTok Display API Client Key | Optional |
| `TIKTOK_CLIENT_SECRET` | TikTok Display API Client Secret | Optional |
| `TIKTOK_REDIRECT_URI` | TikTok OAuth callback URL | `http://localhost:3000/api/v1/auth/tiktok/callback` |
| `EXTERNAL_PROVIDER_BASE_URL` | Third-party provider endpoint | Optional |
| `EXTERNAL_PROVIDER_API_KEY` | Third-party provider API key | Optional |

### 3.3 Database Setup and Migrations

Push the Prisma schema to PostgreSQL and apply the initial migration:
```bash
# Push schema & generate Prisma Client
npx prisma db push

# Mark migration as applied
npx prisma migrate resolve --applied 20261018000000_init

# Populate database with rich seed data (shops, products, creators, videos)
npm run seed
```

---

## 4. Running the Application

### Development Mode (with hot-reload)
```bash
npm run start:dev
```

### Production Build & Run
```bash
npm run build
npm run start:prod
```

### Swagger API Documentation
Open your browser at:
- **Swagger UI**: `http://localhost:3000/api/docs`
- **OpenAPI JSON**: `http://localhost:3000/api/docs-json`

---

## 5. API Endpoints Reference (`/api/v1`)

### Influencer Management
- `POST /api/v1/influencers` — Create tracked creator (validates unique `@username`)
- `GET /api/v1/influencers` — Paginated creators list with multi-filter (`search`, `category`, `trackingStatus`, `minFollowers`, `maxFollowers`, `sortBy`, `sortOrder`)
- `GET /api/v1/influencers/:id` — Creator details, metric snapshots, recent videos
- `PATCH /api/v1/influencers/:id` — Update profile or settings
- `DELETE /api/v1/influencers/:id` — Delete creator and associated jobs
- `POST /api/v1/influencers/:id/track` — Resume active tracking
- `POST /api/v1/influencers/:id/pause` — Pause tracking
- `POST /api/v1/influencers/:id/sync` — Trigger immediate video synchronization
- `POST /api/v1/influencers/bulk-sync` — Bulk trigger synchronization for multiple influencers
- `POST /api/v1/influencers/bulk-track` — Bulk resume tracking
- `POST /api/v1/influencers/bulk-pause` — Bulk pause tracking

### Video Discovery & Feed
- `GET /api/v1/videos` — Paginated videos with multi-criteria filtering (`creatorId`, `username`, `publishedAfter`, `publishedBefore`, `firstSeenAfter`, `firstSeenBefore`, `isNew`, `minViews`, `shopId`, `productId`, `provider`)
- `GET /api/v1/videos/recent` — Recently detected videos across all creators
- `GET /api/v1/videos/:id` — Video details, creator profile, linked product
- `GET /api/v1/influencers/:id/videos` — Videos for a specific creator
- `GET /api/v1/videos/:id/metrics` — Historical engagement metric snapshots
- `POST /api/v1/videos/:id/refresh` — Refresh engagement metrics from provider

### Bright Data TikTok Scraper Architecture
- **Profiles Dataset (`gd_l1villgoiiidt09ci`)**: Synchronously scrapes public profile information (`displayName`, `avatarUrl`, `followers`, `likes`, `profileUrl`), plus immediate `top_videos` and `top_posts_data`.
- **Posts by Profile Fast API (`gd_m7n5v2gq296pex2f5m`)**: Asynchronously triggered for full post histories. Stores `snapshot_id`, enqueues delayed BullMQ polling (`poll-bright-data-snapshot`), downloads and deduplicates 600+ historical videos.
- **Individual Posts (`gd_lu702nij2f790tmv9h`)**: Refresh metrics for an individual video without full profile rescan.
- **Publication vs Detection**: True `create_time` is parsed as `publishedAt` (`publishedAtVerified: true`), while `firstSeenAt` records the exact platform discovery timestamp.
- **Resilience**: In-flight snapshots are tracked in `bright_data_jobs`. On server startup, active jobs are recovered and polling resumes automatically.

### EchoTik Import Module
- `POST /api/v1/imports/influencers/preview` — Multipart file upload (`.xlsx`, `.xls`, `.csv`). Detects title/header rows, normalizes numbers/usernames, returns preview without DB commit.
- `POST /api/v1/imports/influencers` — Executes import transactionally. Upserts creators, handles duplicates, saves `InfluencerMetricSnapshot` with sales & GMV, and logs `ImportBatch`.
- `GET /api/v1/imports/:importId` — Summary of import batch (total, inserted, updated, skipped, failed).
- `GET /api/v1/imports/:importId/errors?format=json|csv` — Row-level error report (downloadable as CSV).

### Tracking & BullMQ Background Jobs
- `GET /api/v1/tracking/jobs` — Formatted tracking job history for frontend dashboard
- `GET /api/v1/tracking/jobs/:id` — Get tracking job status by ID or influencer ID
- `GET /api/v1/tracking/bright-data-jobs` — Inspect Bright Data asynchronous scraping jobs, snapshots, and progress
- `POST /api/v1/tracking/jobs/:id/retry` — Retry a failed job

### Dashboard & Analytics
- `GET /api/v1/dashboard/overview` — Platform KPI aggregates (creators, active, videos, new in 24h, views, likes, GMV, sales)
- `GET /api/v1/dashboard/recent-activity` — Recent videos discovered, imports, and job runs
- `GET /api/v1/dashboard/publishing-trends?days=7` — Daily published vs first-detected counts
- `GET /api/v1/dashboard/most-active-creators?days=30&limit=10` — Creators ranked by publishing volume
- `GET /api/v1/dashboard/tracking-health` — 24h success rate and provider status

### Shops & Products Intelligence
- `GET /api/v1/shops` — Tracked TikTok competitor shops
- `GET /api/v1/products` — Tracked products
- `POST /api/v1/videos/:id/link-product` — Link product to video with evidence type and confidence

### Health & Readiness
- `GET /api/v1/health` — PostgreSQL and Redis connectivity latency and status

### TikTok Display API OAuth
- `GET /api/v1/auth/tiktok/authorize` — Redirect to TikTok OAuth authorization
- `GET /api/v1/auth/tiktok/callback` — OAuth code exchange and token receipt

---

## 6. Testing

Run all unit tests:
```bash
npm test -- --forceExit
```

Run e2e integration tests:
```bash
npm run test:e2e -- --forceExit
```

Test coverage includes:
- **EchoTik Parser**: 100-row XLSX workbook, title row detection, `@username` normalization, Enterprise email filtering, dual `Views` column separation, currency/number parsing.
- **Influencer Service**: CRUD, duplicate username prevention, pagination, category & status filtering.
- **Video Service**: Multi-filter queries, strict separation of `publishedAt` vs `firstSeenAt`, null metric preservation, metric refresh.
- **Tracking Processor**: Distributed locking, new video discovery events, repeat sync idempotency, provider error handling.
- **Dashboard Service**: Real database aggregates, empty dataset handling, health calculation.
- **API E2E**: Live endpoints, multipart file uploads, Swagger validation.

---

## 7. Critical Architecture Policies

1. **Publication vs Discovery Separation**:
   - `publishedAt`: The actual publication timestamp according to the source.
   - `firstSeenAt`: When this platform first discovered the video.
   - `publishedAt` is **never** replaced by `firstSeenAt`.
2. **Nullable Metrics vs Zero**:
   - Unavailable metrics (likes, comments, views) are stored as `null` and never fabricated as `0`.
3. **Enterprise Contact Emails**:
   - Values like `"Only in Enterprise plan"` are parsed as `null`.
4. **Provider Isolation**:
   - External providers implement the `CreatorVideoProvider` interface. If unconfigured, the system reports `PROVIDER_NOT_CONFIGURED` without crashing or returning fake live data.
