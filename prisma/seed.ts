import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Influencer Monitor database...');

  // 0. Seed Default Admin User
  const adminEmail = 'admin@liambui.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('HoThAo@123', 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Liam Bui (Admin)',
        passwordHash,
        role: 'ADMIN',
      },
    });
    console.log(`Seeded platform admin user: ${adminEmail}`);
  }

  // 1. Clear existing data in reverse dependency order
  await prisma.videoProductAssociation.deleteMany();
  await prisma.videoMetricSnapshot.deleteMany();
  await prisma.video.deleteMany();
  await prisma.influencerMetricSnapshot.deleteMany();
  await prisma.trackingJobRun.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.influencer.deleteMany();
  await prisma.importBatch.deleteMany();

  // 2. Seed Shops
  const shop1 = await prisma.shop.create({
    data: {
      id: 'shop-glow-lab',
      name: 'Glow Laboratory US',
      shopUrl: 'https://shop.tiktok.com/view/product/glow_laboratory',
      externalShopId: 'tiktok-shop-789123',
      market: 'US',
      trackingStatus: 'ACTIVE',
      source: 'MANUAL',
    },
  });

  const shop2 = await prisma.shop.create({
    data: {
      id: 'shop-cozy-living',
      name: 'CozyHome Living',
      shopUrl: 'https://shop.tiktok.com/view/product/cozy_home',
      externalShopId: 'tiktok-shop-456789',
      market: 'US',
      trackingStatus: 'ACTIVE',
      source: 'MANUAL',
    },
  });

  const shop3 = await prisma.shop.create({
    data: {
      id: 'shop-tech-gear',
      name: 'TechGear Direct',
      shopUrl: 'https://shop.tiktok.com/view/product/techgear',
      externalShopId: 'tiktok-shop-123456',
      market: 'US',
      trackingStatus: 'ACTIVE',
      source: 'MANUAL',
    },
  });

  console.log('Seeded shops: 3');

  // 3. Seed Products
  const prod1 = await prisma.product.create({
    data: {
      id: 'prod-hyaluronic-serum',
      shopId: shop1.id,
      name: 'Hydrating Hyaluronic Acid Serum 50ml',
      productUrl: 'https://shop.tiktok.com/view/product/172948291039',
      externalProductId: 'tt-prod-88123',
      imageUrl: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&auto=format&fit=crop&q=80',
    },
  });

  const prod2 = await prisma.product.create({
    data: {
      id: 'prod-sunset-lamp',
      shopId: shop2.id,
      name: 'Sunset Projection Ambient Lamp 16 Colors',
      productUrl: 'https://shop.tiktok.com/view/product/172948291040',
      externalProductId: 'tt-prod-88124',
      imageUrl: 'https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=400&auto=format&fit=crop&q=80',
    },
  });

  const prod3 = await prisma.product.create({
    data: {
      id: 'prod-wireless-mic',
      shopId: shop3.id,
      name: 'Wireless Lavalier Microphone for Phone & Camera',
      productUrl: 'https://shop.tiktok.com/view/product/172948291041',
      externalProductId: 'tt-prod-88125',
      imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80',
    },
  });

  console.log('Seeded products: 3');

  // 4. Seed Influencers
  const influencersData = [
    {
      id: 'inf-glow-miami',
      username: 'glow_miami',
      displayName: 'Miami Skincare Lab',
      profileUrl: 'https://www.tiktok.com/@glow_miami',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      followers: 480000,
      likes: 3200000,
      category: 'Beauty & Personal Care',
      trackingStatus: 'ACTIVE',
      source: 'ECHOTIK_EXPORT',
    },
    {
      id: 'inf-dallas-foodie',
      username: 'dallas_foodie',
      displayName: 'Dallas Chef Reviews',
      profileUrl: 'https://www.tiktok.com/@dallas_foodie',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      followers: 195000,
      likes: 950000,
      category: 'Food & Beverage',
      trackingStatus: 'ACTIVE',
      source: 'ECHOTIK_EXPORT',
    },
    {
      id: 'inf-tech-laura',
      username: 'tech_laura',
      displayName: 'Laura Tech Reviews',
      profileUrl: 'https://www.tiktok.com/@tech_laura',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      followers: 730000,
      likes: 5400000,
      category: 'Electronics & Tech',
      trackingStatus: 'ACTIVE',
      source: 'ECHOTIK_EXPORT',
    },
    {
      id: 'inf-home-decor',
      username: 'home_decor_daily',
      displayName: 'Daily Cozy Spaces',
      profileUrl: 'https://www.tiktok.com/@home_decor_daily',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
      followers: 340000,
      likes: 2100000,
      category: 'Home & Kitchen',
      trackingStatus: 'PAUSED',
      source: 'MANUAL',
    },
  ];

  const createdInfluencers: any[] = [];
  for (const inf of influencersData) {
    const created = await prisma.influencer.create({
      data: {
        id: inf.id,
        username: inf.username,
        normalizedUsername: inf.username.toLowerCase(),
        displayName: inf.displayName,
        profileUrl: inf.profileUrl,
        avatarUrl: inf.avatarUrl,
        followers: BigInt(inf.followers),
        likes: BigInt(inf.likes),
        category: inf.category,
        trackingStatus: inf.trackingStatus,
        source: inf.source,
        lastCheckedAt: new Date(Date.now() - 3600000),
        lastSuccessfulSyncAt: new Date(Date.now() - 3600000),
        nextScheduledCheckAt: new Date(Date.now() + 300000),
      },
    });
    createdInfluencers.push(created);

    // Snapshot for influencer metrics
    await prisma.influencerMetricSnapshot.create({
      data: {
        influencerId: created.id,
        source: inf.source,
        followers: BigInt(inf.followers),
        likes: BigInt(inf.likes),
        sales: BigInt(340),
        gmv: 12500.5,
        capturedAt: new Date(Date.now() - 86400000),
      },
    });

    await prisma.influencerMetricSnapshot.create({
      data: {
        influencerId: created.id,
        source: inf.source,
        followers: BigInt(inf.followers + 1500),
        likes: BigInt(inf.likes + 8000),
        sales: BigInt(395),
        gmv: 14200.0,
        capturedAt: new Date(),
      },
    });
  }

  console.log(`Seeded influencers: ${createdInfluencers.length}`);

  // 5. Seed Videos
  const now = Date.now();
  const videosData = [
    {
      id: 'vid-miami-serum-1',
      provider: 'MOCK',
      providerVideoId: 'mock-vid-glow_miami-1',
      creatorId: 'inf-glow-miami',
      caption: 'My honest 2-week review of this trending hyaluronic acid serum! ✨ #skincareroutine #tiktokshop',
      videoUrl: 'https://www.tiktok.com/@glow_miami/video/7301293847192837482',
      thumbnailUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&auto=format&fit=crop&q=80',
      publishedAt: new Date(now - 2 * 86400000),
      publishedAtSource: 'MOCK_PROVIDER',
      publishedAtVerified: true,
      firstSeenAt: new Date(now - 2 * 86400000 + 1800000),
      lastSeenAt: new Date(),
      durationSeconds: 42,
      views: BigInt(285000),
      likes: BigInt(24100),
      comments: BigInt(890),
      shares: BigInt(420),
      dataSource: 'MOCK_PROVIDER',
      productId: prod1.id,
    },
    {
      id: 'vid-miami-morning-2',
      provider: 'MOCK',
      providerVideoId: 'mock-vid-glow_miami-2',
      creatorId: 'inf-glow-miami',
      caption: 'Morning glass skin routine with affordable TikTok Shop holy grails 🫧',
      videoUrl: 'https://www.tiktok.com/@glow_miami/video/7302482910492817293',
      thumbnailUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400&auto=format&fit=crop&q=80',
      publishedAt: new Date(now - 14 * 3600000),
      publishedAtSource: 'MOCK_PROVIDER',
      publishedAtVerified: true,
      firstSeenAt: new Date(now - 12 * 3600000), // Discovered 12 hours ago (new video!)
      lastSeenAt: new Date(),
      durationSeconds: 58,
      views: BigInt(94000),
      likes: BigInt(8700),
      comments: BigInt(310),
      shares: BigInt(150),
      dataSource: 'MOCK_PROVIDER',
      productId: prod1.id,
    },
    {
      id: 'vid-laura-mic-1',
      provider: 'MOCK',
      providerVideoId: 'mock-vid-tech_laura-1',
      creatorId: 'inf-tech-laura',
      caption: 'Stop recording bad audio! This $25 wireless mic changed my content completely 🎙️ #contentcreator #techtok',
      videoUrl: 'https://www.tiktok.com/@tech_laura/video/7303102938475628192',
      thumbnailUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80',
      publishedAt: new Date(now - 4 * 86400000),
      publishedAtSource: 'MOCK_PROVIDER',
      publishedAtVerified: true,
      firstSeenAt: new Date(now - 4 * 86400000 + 3600000),
      lastSeenAt: new Date(),
      durationSeconds: 51,
      views: BigInt(512000),
      likes: BigInt(46200),
      comments: BigInt(1240),
      shares: BigInt(890),
      dataSource: 'MOCK_PROVIDER',
      productId: prod3.id,
    },
    {
      id: 'vid-home-lamp-1',
      provider: 'MOCK',
      providerVideoId: 'mock-vid-home_decor_daily-1',
      creatorId: 'inf-home-decor',
      caption: 'Transforming my boring bedroom with this TikTok viral sunset lamp 🌅 Aesthetic room tour',
      videoUrl: 'https://www.tiktok.com/@home_decor_daily/video/7304192837465928172',
      thumbnailUrl: 'https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=400&auto=format&fit=crop&q=80',
      publishedAt: new Date(now - 5 * 86400000),
      publishedAtSource: 'MOCK_PROVIDER',
      publishedAtVerified: true,
      firstSeenAt: new Date(now - 5 * 86400000 + 7200000),
      lastSeenAt: new Date(),
      durationSeconds: 34,
      views: BigInt(189000),
      likes: BigInt(15400),
      comments: BigInt(410),
      shares: BigInt(220),
      dataSource: 'MOCK_PROVIDER',
      productId: prod2.id,
    },
  ];

  for (const v of videosData) {
    const { productId, ...vData } = v;
    const createdVideo = await prisma.video.create({
      data: vData,
    });

    // Seed snapshots for historical metrics
    await prisma.videoMetricSnapshot.create({
      data: {
        videoId: createdVideo.id,
        source: createdVideo.provider,
        views: BigInt(Number(createdVideo.views || 0) - 50000),
        likes: BigInt(Number(createdVideo.likes || 0) - 4000),
        comments: BigInt(Number(createdVideo.comments || 0) - 100),
        shares: BigInt(Number(createdVideo.shares || 0) - 50),
        capturedAt: new Date(now - 24 * 3600000),
      },
    });

    await prisma.videoMetricSnapshot.create({
      data: {
        videoId: createdVideo.id,
        source: createdVideo.provider,
        views: createdVideo.views,
        likes: createdVideo.likes,
        comments: createdVideo.comments,
        shares: createdVideo.shares,
        capturedAt: new Date(),
      },
    });

    // Link video to product if specified
    if (productId) {
      await prisma.videoProductAssociation.create({
        data: {
          videoId: createdVideo.id,
          productId,
          evidenceType: 'TAG',
          evidenceSource: 'TIKTOK_SHOP_PRODUCT_TAG',
          confidence: 0.98,
          verifiedAt: new Date(),
        },
      });
    }
  }

  console.log(`Seeded videos: ${videosData.length}`);

  // 6. Seed Tracking Job Runs
  await prisma.trackingJobRun.create({
    data: {
      influencerId: 'inf-glow-miami',
      provider: 'MOCK',
      status: 'COMPLETED',
      startedAt: new Date(now - 3600000),
      completedAt: new Date(now - 3590000),
      videosDiscovered: 1,
    },
  });

  await prisma.trackingJobRun.create({
    data: {
      influencerId: 'inf-tech-laura',
      provider: 'MOCK',
      status: 'COMPLETED',
      startedAt: new Date(now - 7200000),
      completedAt: new Date(now - 7190000),
      videosDiscovered: 0,
    },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
