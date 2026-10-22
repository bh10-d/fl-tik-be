import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export function generateEchoTikWorkbook(outDir: string): { xlsxPath: string; csvPath: string } {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Row 1: Title row
  const titleRow = ['EchoTik Influencer Export Report - TikTok Shop US Intelligence', '', '', '', '', '', '', '', '', '', '', '', ''];

  // Row 2: Header row with the exact columns specified in the prompt
  const headerRow = [
    'Nickname',
    'Unique Id',
    'Contact Email',
    'Followers',
    'Likes',
    'Product Category',
    'Sales',
    'GMV($)',
    'Related Videos',
    'Views', // Video views
    'Related Lives',
    'Views', // Live views
    'View More',
  ];

  const categories = [
    'Beauty & Personal Care',
    'Womenswear',
    'Home & Kitchen',
    'Electronics',
    'Health & Wellness',
    'Food & Beverage',
    'Toys & Hobbies',
    'Fashion Accessories',
  ];

  const rows: any[][] = [titleRow, headerRow];

  for (let i = 1; i <= 100; i++) {
    const rawUsername = i % 2 === 0 ? `@creator_test_${i}` : `creator_test_${i}`;
    const nickname = `Creator Test ${i} Official`;
    const email = i % 3 === 0 ? 'Only in Enterprise plan' : (i % 5 === 0 ? '-' : `contact${i}@creatornetwork.com`);
    const followers = i * 15000 + 5000;
    const likes = followers * 6;
    const cat = categories[i % categories.length];
    const sales = i * 120 + 50;
    const gmv = (sales * 28.5).toFixed(2);
    const relatedVideos = (i % 25) + 3;
    const videoViews = relatedVideos * 25000 + i * 100;
    const relatedLives = i % 5;
    const liveViews = relatedLives > 0 ? relatedLives * 15000 : 0;
    const viewMore = `https://echotik.live/creator/${rawUsername.replace('@', '')}`;

    rows.push([
      nickname,
      rawUsername,
      email,
      i % 4 === 0 ? `${Math.round(followers / 1000)}K` : String(followers),
      likes,
      cat,
      sales,
      `$${Number(gmv).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      relatedVideos,
      videoViews,
      relatedLives,
      liveViews,
      viewMore,
    ]);
  }

  // Build XLSX
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'EchoTik Export');

  const xlsxPath = path.join(outDir, 'echotik_influencer_export.xlsx');
  XLSX.writeFile(workbook, xlsxPath);

  // Build CSV
  const csvContent = rows
    .map((r) =>
      r
        .map((cell: any) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(','),
    )
    .join('\n');

  const csvPath = path.join(outDir, 'echotik_influencer_export.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf-8');

  return { xlsxPath, csvPath };
}

if (require.main === module) {
  const result = generateEchoTikWorkbook(path.resolve(__dirname, '../../test/fixtures'));
  console.log(`Generated fixtures:\n - ${result.xlsxPath}\n - ${result.csvPath}`);
}

