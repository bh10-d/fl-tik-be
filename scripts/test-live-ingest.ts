import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function run() {
  console.log('Testing database connection...');
  const count = await prisma.influencer.count();
  console.log(`Current influencers count: ${count}`);

  // Create or find @zachking
  let zach = await prisma.influencer.findUnique({
    where: { normalizedUsername: 'zachking' },
  });

  if (!zach) {
    zach = await prisma.influencer.create({
      data: {
        username: 'zachking',
        normalizedUsername: 'zachking',
        displayName: 'Zach King',
        profileUrl: 'https://www.tiktok.com/@zachking',
        trackingStatus: 'ACTIVE',
        source: 'API',
      },
    });
    console.log(`Created influencer @zachking with ID: ${zach.id}`);
  } else {
    console.log(`Found existing influencer @zachking with ID: ${zach.id}`);
  }

  // Now let's test fetching and ingesting the ready snapshot sd_mve0xga4205rf6ubqd
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    console.error('BRIGHTDATA_API_KEY is not set');
    return;
  }

  const snapshotId = 'sd_mve0xga4205rf6ubqd';
  console.log(`Fetching snapshot ${snapshotId} from Bright Data...`);
  const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    console.error(`Failed to fetch snapshot: ${res.status} ${await res.text()}`);
    return;
  }

  const records: any[] = await res.json();
  console.log(`Downloaded ${records.length} records from Bright Data`);

  let newCount = 0;
  let updateCount = 0;

  for (const item of records.slice(0, 50)) { // Ingest first 50 for quick live test
    const postId = String(item.post_id || item.id || '').trim();
    if (!postId) continue;

    const publishedAt = new Date(item.create_time);
    const existing = await prisma.video.findUnique({
      where: {
        provider_providerVideoId: {
          provider: 'BRIGHT_DATA',
          providerVideoId: postId,
        },
      },
    });

    const views = item.play_count !== undefined && item.play_count !== null ? BigInt(item.play_count) : null;
    const likes = item.digg_count !== undefined && item.digg_count !== null ? BigInt(item.digg_count) : null;
    const comments = item.comment_count !== undefined && item.comment_count !== null ? BigInt(item.comment_count) : null;
    const shares = item.share_count !== undefined && item.share_count !== null ? BigInt(String(item.share_count).replace(/,/g, '')) : null;

    if (existing) {
      await prisma.video.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          views,
          likes,
          comments,
          shares,
        },
      });
      updateCount++;
    } else {
      const now = new Date();
      await prisma.video.create({
        data: {
          provider: 'BRIGHT_DATA',
          providerVideoId: postId,
          creatorId: zach.id,
          caption: item.description || '',
          videoUrl: item.url || `https://www.tiktok.com/@zachking/video/${postId}`,
          thumbnailUrl: item.preview_image || undefined,
          publishedAt,
          publishedAtSource: 'BRIGHT_DATA',
          publishedAtVerified: true,
          firstSeenAt: now,
          lastSeenAt: now,
          durationSeconds: item.video_duration ? Math.round(Number(item.video_duration)) : undefined,
          views,
          likes,
          comments,
          shares,
          dataSource: 'BRIGHT_DATA',
        },
      });
      newCount++;
    }
  }

  console.log(`Live ingest completed: ${newCount} new videos discovered, ${updateCount} existing updated.`);

  const sampleVideo = await prisma.video.findFirst({
    where: { creatorId: zach.id },
    orderBy: { publishedAt: 'desc' },
  });

  console.log('Sample stored video in PostgreSQL:', {
    id: sampleVideo?.id,
    provider: sampleVideo?.provider,
    providerVideoId: sampleVideo?.providerVideoId,
    caption: sampleVideo?.caption,
    publishedAt: sampleVideo?.publishedAt,
    publishedAtVerified: sampleVideo?.publishedAtVerified,
    firstSeenAt: sampleVideo?.firstSeenAt,
    views: sampleVideo?.views ? sampleVideo.views.toString() : null,
    likes: sampleVideo?.likes ? sampleVideo.likes.toString() : null,
  });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

