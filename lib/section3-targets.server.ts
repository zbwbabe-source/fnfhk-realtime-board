import fs from 'fs';
import path from 'path';

export type Section3TargetCategory = 'wear' | 'accessory' | 'all';
export type Section3TargetMode = 'monthly' | 'cumulative';

export interface Section3TargetLeaf {
  category: string;
  category_label_ko: string;
  category_label_en: string;
  target_sold_amt: number;
  target_sold_gross: number;
  target_discount_rate: number | null;
}

type Section3TargetPayload = Record<
  string,
  Partial<Record<Section3TargetMode, Partial<Record<Section3TargetCategory, Section3TargetLeaf>>>>
>;

let cachedPayload: Section3TargetPayload | null = null;
let cachedMonthlyDetailRows: Array<Record<string, string>> | null = null;

function loadPayload(): Section3TargetPayload {
  if (cachedPayload) return cachedPayload;

  const filePath = path.join(process.cwd(), 'data', 'section3_target_source', 'section3_targets.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedPayload = JSON.parse(raw) as Section3TargetPayload;
  return cachedPayload;
}

export function getSection3MonthCode(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  const year = parsed.getFullYear() % 100;
  const month = parsed.getMonth() + 1;
  return `${String(year).padStart(2, '0')}${String(month).padStart(2, '0')}`;
}

export function getSection3Target(
  monthCode: string,
  mode: Section3TargetMode,
  category: Section3TargetCategory
): Section3TargetLeaf | null {
  const payload = loadPayload();
  return payload[monthCode]?.[mode]?.[category] ?? null;
}

function loadMonthlyDetailRows(): Array<Record<string, string>> {
  if (cachedMonthlyDetailRows) return cachedMonthlyDetailRows;
  const filePath = path.join(process.cwd(), 'data', 'section3_target_source', 'monthly_detail.csv');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  cachedMonthlyDetailRows = lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? '']));
  });
  return cachedMonthlyDetailRows;
}

function parseSeasonContext(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  if (month >= 9) {
    return {
      seasonType: 'FW' as const,
      currentYY: year % 100,
      monthCodesForCumulative: [9, 10, 11, 12].filter((m) => m <= month).map((m) => `${String(year % 100).padStart(2, '0')}${String(m).padStart(2, '0')}`),
    };
  }
  if (month <= 2) {
    return {
      seasonType: 'FW' as const,
      currentYY: (year - 1) % 100,
      monthCodesForCumulative: [1, 2].filter((m) => m <= month).map((m) => `${String(year % 100).padStart(2, '0')}${String(m).padStart(2, '0')}`),
    };
  }
  return {
    seasonType: 'SS' as const,
    currentYY: year % 100,
    monthCodesForCumulative: [3, 4, 5, 6, 7, 8].filter((m) => m <= month).map((m) => `${String(year % 100).padStart(2, '0')}${String(m).padStart(2, '0')}`),
  };
}

function parseSeasonName(seasonName: string): { yy: number; type: 'SS' | 'FW' } | null {
  const text = String(seasonName || '').trim().toUpperCase();
  if (!/^\d{4}(SS|FW)$/.test(text)) return null;
  return {
    yy: Number(text.slice(2, 4)),
    type: text.endsWith('SS') ? 'SS' : 'FW',
  };
}

function toBucket(diff: number): '1년차' | '2년차' | '3년차 이상' | null {
  if (diff === 1) return '1년차';
  if (diff === 2) return '2년차';
  if (diff >= 3) return '3년차 이상';
  return null;
}

export function getSection3YearBucketTargets(
  date: string,
  category: Section3TargetCategory,
  mode: Section3TargetMode
): Record<string, Section3TargetLeaf> {
  const rows = loadMonthlyDetailRows();
  const { seasonType, currentYY, monthCodesForCumulative } = parseSeasonContext(date);
  const monthCode = getSection3MonthCode(date);
  const selectedMonthCodes = mode === 'monthly' ? [monthCode] : monthCodesForCumulative;
  const categoryTypes =
    category === 'wear' ? ['WEAR'] : category === 'accessory' ? ['ACCESSORY'] : ['WEAR', 'ACCESSORY'];

  const aggregates: Record<string, { amt: number; gross: number }> = {
    '1년차': { amt: 0, gross: 0 },
    '2년차': { amt: 0, gross: 0 },
    '3년차 이상': { amt: 0, gross: 0 },
  };

  for (const row of rows) {
    if (row.row_kind !== 'detail' || row.season_group !== 'SEASONAL') continue;
    if (!selectedMonthCodes.includes(row.month_code)) continue;
    if (!categoryTypes.includes(row.type_name)) continue;

    const season = parseSeasonName(row.season_name);
    if (!season || season.type !== seasonType) continue;
    const diff = currentYY - season.yy;
    const bucket = toBucket(diff);
    if (!bucket) continue;

    aggregates[bucket].amt += Number(row.sold_amt || 0);
    aggregates[bucket].gross += Number(row.sold_gross || 0);
  }

  return Object.fromEntries(
    Object.entries(aggregates).map(([bucket, value]) => [
      bucket,
      {
        category: bucket,
        category_label_ko: bucket,
        category_label_en: bucket,
        target_sold_amt: value.amt,
        target_sold_gross: value.gross,
        target_discount_rate: value.gross > 0 ? 1 - value.amt / value.gross : null,
      },
    ])
  );
}
