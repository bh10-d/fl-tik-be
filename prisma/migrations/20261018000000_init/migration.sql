-- CreateTable
CREATE TABLE "influencers" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "normalizedUsername" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "externalUserId" TEXT,
    "followers" BIGINT,
    "likes" BIGINT,
    "category" TEXT,
    "trackingStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "nextScheduledCheckAt" TIMESTAMP(3),
    "lastSyncError" TEXT,

    CONSTRAINT "influencers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_metric_snapshots" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "followers" BIGINT,
    "likes" BIGINT,
    "sales" BIGINT,
    "gmv" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "influencer_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerVideoId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "caption" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "publishedAtSource" TEXT NOT NULL,
    "publishedAtVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER,
    "views" BIGINT,
    "likes" BIGINT,
    "comments" BIGINT,
    "shares" BIGINT,
    "dataSource" TEXT NOT NULL,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_metric_snapshots" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" BIGINT,
    "likes" BIGINT,
    "comments" BIGINT,
    "shares" BIGINT,
    "source" TEXT NOT NULL,

    CONSTRAINT "video_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopUrl" TEXT,
    "externalShopId" TEXT,
    "market" TEXT,
    "trackingStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "name" TEXT NOT NULL,
    "productUrl" TEXT,
    "externalProductId" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_product_associations" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceSource" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_product_associations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_job_runs" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "videosDiscovered" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tracking_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ECHOTIK_EXPORT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "insertedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "influencers_normalizedUsername_key" ON "influencers"("normalizedUsername");
CREATE INDEX "influencers_normalizedUsername_idx" ON "influencers"("normalizedUsername");
CREATE INDEX "influencers_trackingStatus_idx" ON "influencers"("trackingStatus");
CREATE INDEX "influencers_category_idx" ON "influencers"("category");
CREATE INDEX "influencers_lastCheckedAt_idx" ON "influencers"("lastCheckedAt");

-- CreateIndex
CREATE INDEX "influencer_metric_snapshots_influencerId_idx" ON "influencer_metric_snapshots"("influencerId");
CREATE INDEX "influencer_metric_snapshots_capturedAt_idx" ON "influencer_metric_snapshots"("capturedAt");

-- CreateIndex
CREATE INDEX "videos_creatorId_idx" ON "videos"("creatorId");
CREATE INDEX "videos_publishedAt_idx" ON "videos"("publishedAt");
CREATE INDEX "videos_firstSeenAt_idx" ON "videos"("firstSeenAt");
CREATE INDEX "videos_views_idx" ON "videos"("views");
CREATE INDEX "videos_likes_idx" ON "videos"("likes");
CREATE UNIQUE INDEX "videos_provider_providerVideoId_key" ON "videos"("provider", "providerVideoId");

-- CreateIndex
CREATE INDEX "video_metric_snapshots_videoId_idx" ON "video_metric_snapshots"("videoId");
CREATE INDEX "video_metric_snapshots_capturedAt_idx" ON "video_metric_snapshots"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "shops_externalShopId_key" ON "shops"("externalShopId");
CREATE UNIQUE INDEX "products_externalProductId_key" ON "products"("externalProductId");
CREATE INDEX "products_shopId_idx" ON "products"("shopId");

-- CreateIndex
CREATE INDEX "video_product_associations_videoId_idx" ON "video_product_associations"("videoId");
CREATE INDEX "video_product_associations_productId_idx" ON "video_product_associations"("productId");
CREATE UNIQUE INDEX "video_product_associations_videoId_productId_key" ON "video_product_associations"("videoId", "productId");

-- CreateIndex
CREATE INDEX "tracking_job_runs_influencerId_idx" ON "tracking_job_runs"("influencerId");
CREATE INDEX "tracking_job_runs_startedAt_idx" ON "tracking_job_runs"("startedAt");
CREATE INDEX "tracking_job_runs_status_idx" ON "tracking_job_runs"("status");

-- AddForeignKey
ALTER TABLE "influencer_metric_snapshots" ADD CONSTRAINT "influencer_metric_snapshots_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_metric_snapshots" ADD CONSTRAINT "video_metric_snapshots_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_product_associations" ADD CONSTRAINT "video_product_associations_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_product_associations" ADD CONSTRAINT "video_product_associations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_job_runs" ADD CONSTRAINT "tracking_job_runs_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

