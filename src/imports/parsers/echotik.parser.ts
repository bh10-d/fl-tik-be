import * as XLSX from 'xlsx';
import { parse as parseCsvSync } from 'csv-parse/sync';

export interface ParsedInfluencerRow {
  rowNumber: number;
  rawUsername: string;
  normalizedUsername: string;
  displayName: string;
  email: string | null;
  followers: number | null;
  likes: number | null;
  category: string | null;
  sales: number | null;
  gmv: number | null;
  relatedVideosCount: number | null;
  videoViews: number | null;
  relatedLivesCount: number | null;
  liveViews: number | null;
  profileUrl: string;
  rawRow: Record<string, any>;
  isValid: boolean;
  validationError?: string;
}

export interface ParseResult {
  headerRowIndex: number;
  headers: string[];
  totalRows: number;
  validRows: ParsedInfluencerRow[];
  invalidRows: ParsedInfluencerRow[];
}

export class EchoTikParser {
  /**
   * Parse a file buffer (.xlsx, .xls, or .csv)
   */
  static parse(buffer: Buffer, filename: string): ParseResult {
    const isCsv = filename.toLowerCase().endsWith('.csv');
    let matrix: any[][] = [];

    if (isCsv) {
      const content = buffer.toString('utf-8');
      matrix = parseCsvSync(content, {
        relax_column_count: true,
        skip_empty_lines: true,
      }) as any[][];
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    }

    return this.parseMatrix(matrix);
  }

  /**
   * Parse raw 2D array representation of sheet/csv
   */
  static parseMatrix(matrix: any[][]): ParseResult {
    const headerRowIndex = this.findHeaderRow(matrix);
    if (headerRowIndex === -1) {
      throw new Error(
        'Unable to detect header row. Required columns like "Unique Id", "username", or "Nickname" were not found.',
      );
    }

    const rawHeaders = matrix[headerRowIndex].map((h) => String(h || '').trim());
    const headerIndices = this.mapHeaderIndices(rawHeaders);

    const validRows: ParsedInfluencerRow[] = [];
    const invalidRows: ParsedInfluencerRow[] = [];

    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
      const row = matrix[i];
      if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) {
        continue; // skip completely empty rows
      }

      const rowNumber = i + 1;
      const parsedRow = this.parseRow(row, rowNumber, rawHeaders, headerIndices);

      if (parsedRow.isValid) {
        validRows.push(parsedRow);
      } else {
        invalidRows.push(parsedRow);
      }
    }

    return {
      headerRowIndex,
      headers: rawHeaders,
      totalRows: validRows.length + invalidRows.length,
      validRows,
      invalidRows,
    };
  }

  /**
   * Detect header row by looking for signature columns
   */
  private static findHeaderRow(matrix: any[][]): number {
    for (let r = 0; r < Math.min(matrix.length, 15); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;

      const normalizedCells = row.map((c) => String(c || '').toLowerCase().trim());

      const hasUniqueId = normalizedCells.some((c) => c === 'unique id' || c === 'uniqueid' || c === 'username' || c === 'handle');
      const hasNickname = normalizedCells.some((c) => c === 'nickname' || c === 'display name' || c === 'displayname' || c === 'name');
      const hasFollowers = normalizedCells.some((c) => c.includes('follower'));

      if ((hasUniqueId || hasNickname) && (hasFollowers || normalizedCells.length >= 3)) {
        return r;
      }
    }
    return -1;
  }

  /**
   * Map column indices handling multiple "Views" columns separately
   */
  private static mapHeaderIndices(headers: string[]): {
    uniqueIdIndex: number;
    nicknameIndex: number;
    emailIndex: number;
    followersIndex: number;
    likesIndex: number;
    categoryIndex: number;
    salesIndex: number;
    gmvIndex: number;
    relatedVideosIndex: number;
    videoViewsIndex: number;
    relatedLivesIndex: number;
    liveViewsIndex: number;
  } {
    let uniqueIdIndex = -1;
    let nicknameIndex = -1;
    let emailIndex = -1;
    let followersIndex = -1;
    let likesIndex = -1;
    let categoryIndex = -1;
    let salesIndex = -1;
    let gmvIndex = -1;
    let relatedVideosIndex = -1;
    let videoViewsIndex = -1;
    let relatedLivesIndex = -1;
    let liveViewsIndex = -1;

    let viewsColumnCount = 0;

    headers.forEach((h, idx) => {
      const col = h.toLowerCase().trim();

      if (col === 'unique id' || col === 'uniqueid' || col === 'username' || col === 'handle') {
        uniqueIdIndex = idx;
      } else if (col === 'nickname' || col === 'display name' || col === 'displayname' || col === 'name') {
        nicknameIndex = idx;
      } else if (col.includes('email') || col.includes('contact')) {
        emailIndex = idx;
      } else if (col.includes('follower')) {
        followersIndex = idx;
      } else if (col === 'likes' || col === 'like') {
        likesIndex = idx;
      } else if (col.includes('category')) {
        categoryIndex = idx;
      } else if (col === 'sales' || col.includes('sale')) {
        salesIndex = idx;
      } else if (col.includes('gmv')) {
        gmvIndex = idx;
      } else if (col.includes('video') && !col.includes('view')) {
        relatedVideosIndex = idx;
      } else if (col.includes('live') && !col.includes('view')) {
        relatedLivesIndex = idx;
      } else if (col === 'views' || col.includes('view')) {
        viewsColumnCount++;
        if (viewsColumnCount === 1) {
          videoViewsIndex = idx;
        } else if (viewsColumnCount === 2) {
          liveViewsIndex = idx;
        }
      }
    });

    return {
      uniqueIdIndex,
      nicknameIndex,
      emailIndex,
      followersIndex,
      likesIndex,
      categoryIndex,
      salesIndex,
      gmvIndex,
      relatedVideosIndex,
      videoViewsIndex,
      relatedLivesIndex,
      liveViewsIndex,
    };
  }

  private static parseRow(
    row: any[],
    rowNumber: number,
    headers: string[],
    indices: ReturnType<typeof EchoTikParser.mapHeaderIndices>,
  ): ParsedInfluencerRow {
    const rawRow: Record<string, any> = {};
    headers.forEach((h, idx) => {
      rawRow[h || `Column_${idx}`] = row[idx] ?? '';
    });

    const rawUniqueId = indices.uniqueIdIndex !== -1 ? String(row[indices.uniqueIdIndex] || '').trim() : '';
    const rawNickname = indices.nicknameIndex !== -1 ? String(row[indices.nicknameIndex] || '').trim() : '';

    const chosenUsername = rawUniqueId || rawNickname;
    const normalizedUsername = chosenUsername.replace(/^@/, '').trim().toLowerCase();

    if (!normalizedUsername) {
      return {
        rowNumber,
        rawUsername: '',
        normalizedUsername: '',
        displayName: rawNickname,
        email: null,
        followers: null,
        likes: null,
        category: null,
        sales: null,
        gmv: null,
        relatedVideosCount: null,
        videoViews: null,
        relatedLivesCount: null,
        liveViews: null,
        profileUrl: '',
        rawRow,
        isValid: false,
        validationError: 'Missing identifier: both Unique Id and Nickname are empty',
      };
    }

    // Validate username syntax (standard TikTok username characters: letters, numbers, underscores, dots)
    const validUsernameRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!validUsernameRegex.test(normalizedUsername)) {
      return {
        rowNumber,
        rawUsername: chosenUsername,
        normalizedUsername,
        displayName: rawNickname || chosenUsername,
        email: null,
        followers: null,
        likes: null,
        category: null,
        sales: null,
        gmv: null,
        relatedVideosCount: null,
        videoViews: null,
        relatedLivesCount: null,
        liveViews: null,
        profileUrl: `https://www.tiktok.com/@${normalizedUsername}`,
        rawRow,
        isValid: false,
        validationError: `Invalid username characters: "${normalizedUsername}"`,
      };
    }

    const emailRaw = indices.emailIndex !== -1 ? String(row[indices.emailIndex] || '').trim() : '';
    const email =
      emailRaw &&
      !emailRaw.toLowerCase().includes('enterprise') &&
      !emailRaw.toLowerCase().includes('only in') &&
      emailRaw.includes('@')
        ? emailRaw
        : null;

    const followers = indices.followersIndex !== -1 ? this.parseNumber(row[indices.followersIndex]) : null;
    const likes = indices.likesIndex !== -1 ? this.parseNumber(row[indices.likesIndex]) : null;
    const category = indices.categoryIndex !== -1 ? String(row[indices.categoryIndex] || '').trim() || null : null;
    const sales = indices.salesIndex !== -1 ? this.parseNumber(row[indices.salesIndex]) : null;
    const gmv = indices.gmvIndex !== -1 ? this.parseCurrency(row[indices.gmvIndex]) : null;

    const relatedVideosCount =
      indices.relatedVideosIndex !== -1 ? this.parseNumber(row[indices.relatedVideosIndex]) : null;
    const videoViews = indices.videoViewsIndex !== -1 ? this.parseNumber(row[indices.videoViewsIndex]) : null;
    const relatedLivesCount =
      indices.relatedLivesIndex !== -1 ? this.parseNumber(row[indices.relatedLivesIndex]) : null;
    const liveViews = indices.liveViewsIndex !== -1 ? this.parseNumber(row[indices.liveViewsIndex]) : null;

    return {
      rowNumber,
      rawUsername: chosenUsername,
      normalizedUsername,
      displayName: rawNickname || chosenUsername,
      email,
      followers,
      likes,
      category,
      sales,
      gmv,
      relatedVideosCount,
      videoViews,
      relatedLivesCount,
      liveViews,
      profileUrl: `https://www.tiktok.com/@${normalizedUsername}`,
      rawRow,
      isValid: true,
    };
  }

  /**
   * Parse numeric values supporting compact units (1.2K, 3.4M, commas)
   */
  static parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isNaN(value) ? null : Math.round(value);

    let str = String(value).trim().replace(/,/g, '');
    if (str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') return null;

    let multiplier = 1;
    if (str.endsWith('K') || str.endsWith('k')) {
      multiplier = 1000;
      str = str.slice(0, -1).trim();
    } else if (str.endsWith('M') || str.endsWith('m')) {
      multiplier = 1000000;
      str = str.slice(0, -1).trim();
    } else if (str.endsWith('B') || str.endsWith('b')) {
      multiplier = 1000000000;
      str = str.slice(0, -1).trim();
    }

    const num = parseFloat(str);
    return isNaN(num) ? null : Math.round(num * multiplier);
  }

  /**
   * Parse currency values ($1,234.56, $12.5K)
   */
  static parseCurrency(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isNaN(value) ? null : value;

    let str = String(value).trim().replace(/[$,]/g, '');
    if (str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') return null;

    let multiplier = 1;
    if (str.endsWith('K') || str.endsWith('k')) {
      multiplier = 1000;
      str = str.slice(0, -1).trim();
    } else if (str.endsWith('M') || str.endsWith('m')) {
      multiplier = 1000000;
      str = str.slice(0, -1).trim();
    } else if (str.endsWith('B') || str.endsWith('b')) {
      multiplier = 1000000000;
      str = str.slice(0, -1).trim();
    }

    const num = parseFloat(str);
    return isNaN(num) ? null : num * multiplier;
  }
}

