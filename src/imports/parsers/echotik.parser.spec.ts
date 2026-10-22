import * as fs from 'fs';
import * as path from 'path';
import { EchoTikParser } from './echotik.parser';

describe('EchoTikParser', () => {
  const xlsxFixturePath = path.resolve(__dirname, '../../../test/fixtures/echotik_influencer_export.xlsx');
  const csvFixturePath = path.resolve(__dirname, '../../../test/fixtures/echotik_influencer_export.csv');

  it('should successfully parse the actual 100-row EchoTik XLSX workbook structure', () => {
    const buffer = fs.readFileSync(xlsxFixturePath);
    const result = EchoTikParser.parse(buffer, 'echotik_influencer_export.xlsx');

    expect(result.headerRowIndex).toBe(1); // Title row is at 0, header row is at 1
    expect(result.totalRows).toBe(100);
    expect(result.validRows.length).toBe(100);
    expect(result.invalidRows.length).toBe(0);
  });

  it('should detect title row before header row and identify column headers', () => {
    const buffer = fs.readFileSync(xlsxFixturePath);
    const result = EchoTikParser.parse(buffer, 'echotik_influencer_export.xlsx');

    expect(result.headers).toContain('Nickname');
    expect(result.headers).toContain('Unique Id');
    expect(result.headers).toContain('Contact Email');
    expect(result.headers).toContain('Followers');
    expect(result.headers).toContain('Views');
  });

  it('should normalize @username by removing leading @ and trimming whitespace', () => {
    const buffer = fs.readFileSync(xlsxFixturePath);
    const result = EchoTikParser.parse(buffer, 'echotik_influencer_export.xlsx');

    // Row with raw @creator_test_2 should be normalized to creator_test_2
    const row2 = result.validRows.find((r) => r.rawUsername.includes('creator_test_2'));
    expect(row2).toBeDefined();
    expect(row2!.rawUsername).toBe('@creator_test_2');
    expect(row2!.normalizedUsername).toBe('creator_test_2');
    expect(row2!.profileUrl).toBe('https://www.tiktok.com/@creator_test_2');
  });

  it('should treat "Only in Enterprise plan" contact email as null/unavailable', () => {
    const buffer = fs.readFileSync(xlsxFixturePath);
    const result = EchoTikParser.parse(buffer, 'echotik_influencer_export.xlsx');

    // Multiples of 3 have "Only in Enterprise plan"
    const enterpriseRow = result.validRows.find((r) => r.rowNumber === 5); // index-based
    const rowWithEmail = result.validRows.find((r) => r.email !== null);

    expect(enterpriseRow).toBeDefined();
    expect(enterpriseRow!.email).toBeNull();

    expect(rowWithEmail).toBeDefined();
    expect(rowWithEmail!.email).toContain('@creatornetwork.com');
  });

  it('should map the two Views columns separately (video views vs live views)', () => {
    const buffer = fs.readFileSync(xlsxFixturePath);
    const result = EchoTikParser.parse(buffer, 'echotik_influencer_export.xlsx');

    const firstRow = result.validRows[0];
    expect(firstRow.videoViews).toBeGreaterThan(0);
    expect(typeof firstRow.videoViews).toBe('number');
    expect(typeof firstRow.liveViews).toBe('number');
  });

  it('should correctly parse currency, compact numbers (K, M) and missing values', () => {
    expect(EchoTikParser.parseNumber('12.5K')).toBe(12500);
    expect(EchoTikParser.parseNumber('1.2M')).toBe(1200000);
    expect(EchoTikParser.parseNumber('350,000')).toBe(350000);
    expect(EchoTikParser.parseNumber('-')).toBeNull();
    expect(EchoTikParser.parseNumber('N/A')).toBeNull();
    expect(EchoTikParser.parseNumber('')).toBeNull();

    expect(EchoTikParser.parseCurrency('$1,234.56')).toBe(1234.56);
    expect(EchoTikParser.parseCurrency('$12.5K')).toBe(12500);
    expect(EchoTikParser.parseCurrency('-')).toBeNull();
  });

  it('should parse CSV format with same accuracy', () => {
    const buffer = fs.readFileSync(csvFixturePath);
    const result = EchoTikParser.parse(buffer, 'echotik_influencer_export.csv');

    expect(result.totalRows).toBe(100);
    expect(result.validRows.length).toBe(100);
    expect(result.validRows[0].normalizedUsername).toBe('creator_test_1');
  });

  it('should invalidate malformed rows missing both Unique Id and Nickname', () => {
    const malformedCsv = `EchoTik Title Row,,,
Nickname,Unique Id,Followers,Category
,,10000,Beauty
Valid Creator,@valid_creator,50000,Fashion
,invalid_chars!#$,20000,Tech`;

    const result = EchoTikParser.parse(Buffer.from(malformedCsv), 'test.csv');
    expect(result.validRows.length).toBe(1);
    expect(result.invalidRows.length).toBe(2);
    expect(result.invalidRows[0].validationError).toContain('Missing identifier');
    expect(result.invalidRows[1].validationError).toContain('Invalid username characters');
  });
});

