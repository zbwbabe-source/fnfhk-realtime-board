import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

type DataFileConfig = {
  displayName: string;
  relativePath: string;
  kind: 'upload' | 'derived';
  usedBy: string[];
  source?: string;
};

type SqlSourceConfig = {
  filePath: string;
  label: string;
};

type SqlTableConfig = {
  tableName: string;
  usedBy: string[];
  purpose: string;
  sourceFiles: SqlSourceConfig[];
};

const DATA_FILES: DataFileConfig[] = [
  { displayName: 'FNF HKMCTW Store code.csv', relativePath: 'FNF HKMCTW Store code.csv', kind: 'upload', usedBy: ['Store 마스터 변환 원본'], source: 'data/store_master.json' },
  { displayName: 'TARGET.csv', relativePath: 'TARGET.csv', kind: 'upload', usedBy: ['목표 데이터 변환 원본'], source: 'data/target.json' },
  { displayName: 'HKMC Store 면적.csv', relativePath: 'HKMC Store 면적.csv', kind: 'upload', usedBy: ['면적 데이터 변환 원본'], source: 'data/store_area.json' },
  { displayName: 'TW_Exchange Rate 2512.csv', relativePath: 'TW_Exchange Rate 2512.csv', kind: 'upload', usedBy: ['환율 데이터 변환 원본'], source: 'data/tw_exchange_rate.json' },
  { displayName: 'data/store_master.json', relativePath: 'data/store_master.json', kind: 'derived', usedBy: ['Section1 전체 매장 필터/매핑'] },
  { displayName: 'data/target.json', relativePath: 'data/target.json', kind: 'derived', usedBy: ['Section1 목표/달성률 계산'] },
  { displayName: 'data/store_area.json', relativePath: 'data/store_area.json', kind: 'derived', usedBy: ['매장 면적 기반 지표 계산'] },
  { displayName: 'data/tw_exchange_rate.json', relativePath: 'data/tw_exchange_rate.json', kind: 'derived', usedBy: ['TW/HK 환산 로직'] },
  { displayName: 'data/category.csv', relativePath: 'data/category.csv', kind: 'upload', usedBy: ['카테고리 필터/매핑'] },
  { displayName: 'public/HKMCweight_2026_daily.csv', relativePath: 'public/HKMCweight_2026_daily.csv', kind: 'upload', usedBy: ['가중치(Weight) 기반 계산 로직'] },
];

const SQL_TABLES: SqlTableConfig[] = [
  {
    tableName: 'SAP_FNF.DW_HMD_SALE_D',
    usedBy: ['/api/latest-date', '/api/section1/store-sales', '/api/section1/monthly-trend', '/api/section2/sellthrough', '/api/section2/treemap', '/api/section3/old-season-inventory'],
    purpose: '매출/판매 기준 데이터',
    sourceFiles: [
      { filePath: 'app/api/latest-date/route.ts', label: 'Latest Date API' },
      { filePath: 'lib/section1/store-sales.ts', label: 'Section1 Store Sales' },
      { filePath: 'lib/section1/monthly-trend.ts', label: 'Section1 Monthly Trend' },
      { filePath: 'lib/section2/sellthrough.ts', label: 'Section2 Sellthrough' },
      { filePath: 'lib/section2/treemap.ts', label: 'Section2 Treemap' },
      { filePath: 'lib/section3Query.ts', label: 'Section3 Query' },
    ],
  },
  {
    tableName: 'SAP_FNF.DW_HMD_STOCK_SNAP_D',
    usedBy: ['/api/section2/sellthrough', '/api/section3/old-season-inventory'],
    purpose: '재고 스냅샷 기준 데이터',
    sourceFiles: [
      { filePath: 'lib/section2/sellthrough.ts', label: 'Section2 Sellthrough' },
      { filePath: 'lib/section3Query.ts', label: 'Section3 Query' },
    ],
  },
  {
    tableName: 'SAP_FNF.PREP_HMD_STOCK',
    usedBy: ['/api/section2/sellthrough', '/api/section3/old-season-inventory'],
    purpose: '재고 보조(사전 집계) 데이터',
    sourceFiles: [
      { filePath: 'lib/section2/sellthrough.ts', label: 'Section2 Sellthrough' },
      { filePath: 'lib/section3Query.ts', label: 'Section3 Query' },
    ],
  },
];

function calcLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function inferQueryName(content: string, index: number, fallback: string): string {
  const lookback = content.slice(Math.max(0, index - 240), index);
  const lines = lookback.split('\n').reverse();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^const\s+([A-Za-z0-9_]+)\s*=/);
    if (match) return match[1];
  }
  return fallback;
}

function trimSql(sql: string): string {
  const normalized = sql
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
  const maxLen = 1800;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}\n-- ...truncated` : normalized;
}

function extractQueriesFromSource(content: string, tableName: string, sourceLabel: string, filePath: string) {
  const results: Array<{ name: string; source: string; sql: string }> = [];
  const regex = /`([\s\S]*?)`/g;
  let i = 0;
  for (const match of content.matchAll(regex)) {
    const raw = match[1];
    if (!raw) continue;
    if (!raw.includes(tableName)) continue;
    if (!/\b(SELECT|WITH|FROM)\b/i.test(raw)) continue;

    const index = match.index ?? 0;
    const line = calcLineNumber(content, index);
    const name = inferQueryName(content, index, `query_${++i}`);
    results.push({
      name: `${sourceLabel}.${name}`,
      source: `${filePath}:${line}`,
      sql: trimSql(raw),
    });
  }
  return results;
}

async function buildQueryExamples(cwd: string, table: SqlTableConfig) {
  const examples: Array<{ name: string; source: string; sql: string }> = [];
  for (const src of table.sourceFiles) {
    const fullPath = path.join(cwd, src.filePath);
    try {
      const content = await readFile(fullPath, 'utf-8');
      const extracted = extractQueriesFromSource(content, table.tableName, src.label, src.filePath);
      examples.push(...extracted);
    } catch {
      // non-fatal: skip missing/unreadable source
    }
  }
  return examples.slice(0, 12);
}

export async function GET() {
  try {
    const cwd = process.cwd();
    const fileRows = await Promise.all(
      DATA_FILES.map(async (item) => {
        const fullPath = path.join(cwd, item.relativePath);
        try {
          const fileStat = await stat(fullPath);
          return {
            ...item,
            exists: true,
            updatedAt: fileStat.mtime.toISOString(),
            sizeKb: Number((fileStat.size / 1024).toFixed(1)),
          };
        } catch {
          return { ...item, exists: false, updatedAt: null, sizeKb: null };
        }
      })
    );

    const sqlTables = await Promise.all(
      SQL_TABLES.map(async (table) => ({
        tableName: table.tableName,
        usedBy: table.usedBy,
        purpose: table.purpose,
        queryExamples: await buildQueryExamples(cwd, table),
      }))
    );

    const timestamps = fileRows.map((f) => (f.updatedAt ? new Date(f.updatedAt).getTime() : 0)).filter((t) => t > 0);
    const lastUpdatedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      lastUpdatedAt,
      files: fileRows,
      sqlTables,
      notes: {
        uploadHistoryScope: '서버에서 확인 가능한 현재 파일 기준(수정 시각)',
        sqlSourceScope: '실제 코드 파일에서 템플릿 SQL 자동 추출',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to build data management status', message: error.message }, { status: 500 });
  }
}
