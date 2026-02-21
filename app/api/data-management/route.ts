import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { getRedisClient } from '@/lib/cache';
import timestampSnapshotData from '@/data/upload_timestamps.json';

export const dynamic = 'force-dynamic';

type DataFileConfig = {
  displayName: string;
  relativePath: string;
  kind: 'upload' | 'derived';
  usedBy: string[];
  source?: string;
};

type SqlTableConfig = {
  tableName: string;
  usedBy: string[];
  purpose: string;
  sourceFiles: SqlSourceConfig[];
};
type SqlSourceConfig = { filePath: string; label: string };

type FileUpdateEntry = {
  updatedAt: string;
  source: 'manual';
};
type FileUpdateLog = Record<string, FileUpdateEntry | string>;
type FileTimestampSnapshot = Record<string, string>;

const DATA_FILES: DataFileConfig[] = [
  { displayName: 'FNF HKMCTW Store code.csv', relativePath: 'FNF HKMCTW Store code.csv', kind: 'upload', usedBy: ['Store master conversion source'], source: 'data/store_master.json' },
  { displayName: 'TARGET.csv', relativePath: 'TARGET.csv', kind: 'upload', usedBy: ['Target data conversion source'], source: 'data/target.json' },
  { displayName: 'HKMC Store 면적.csv', relativePath: 'HKMC Store 면적.csv', kind: 'upload', usedBy: ['Store area conversion source'], source: 'data/store_area.json' },
  { displayName: 'TW_Exchange Rate 2512.csv', relativePath: 'TW_Exchange Rate 2512.csv', kind: 'upload', usedBy: ['Exchange rate conversion source'], source: 'data/tw_exchange_rate.json' },
  { displayName: 'data/store_master.json', relativePath: 'data/store_master.json', kind: 'derived', usedBy: ['Section1 store mapping'] },
  { displayName: 'data/target.json', relativePath: 'data/target.json', kind: 'derived', usedBy: ['Section1 target / achievement'] },
  { displayName: 'data/store_area.json', relativePath: 'data/store_area.json', kind: 'derived', usedBy: ['Store area KPI calculation'] },
  { displayName: 'data/tw_exchange_rate.json', relativePath: 'data/tw_exchange_rate.json', kind: 'derived', usedBy: ['TW/HK exchange logic'] },
  { displayName: 'data/category.csv', relativePath: 'data/category.csv', kind: 'upload', usedBy: ['Category filter / mapping'] },
  { displayName: 'public/HKMCweight_2026_daily.csv', relativePath: 'public/HKMCweight_2026_daily.csv', kind: 'upload', usedBy: ['Weight-based calculation logic'] },
];

const SQL_TABLES: SqlTableConfig[] = [
  {
    tableName: 'SAP_FNF.DW_HMD_SALE_D',
    usedBy: ['/api/latest-date', '/api/section1/store-sales', '/api/section1/monthly-trend', '/api/section2/sellthrough', '/api/section2/treemap', '/api/section3/old-season-inventory'],
    purpose: 'Sales source table',
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
    purpose: 'Stock snapshot table',
    sourceFiles: [
      { filePath: 'lib/section2/sellthrough.ts', label: 'Section2 Sellthrough' },
      { filePath: 'lib/section3Query.ts', label: 'Section3 Query' },
    ],
  },
  {
    tableName: 'SAP_FNF.PREP_HMD_STOCK',
    usedBy: ['/api/section2/sellthrough', '/api/section3/old-season-inventory'],
    purpose: 'Pre-aggregated stock table',
    sourceFiles: [
      { filePath: 'lib/section2/sellthrough.ts', label: 'Section2 Sellthrough' },
      { filePath: 'lib/section3Query.ts', label: 'Section3 Query' },
    ],
  },
];

const FILE_UPDATE_LOG_KEY = 'fnfhk:data-management:file-updated-at';

async function safeStatIso(filePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.mtime.toISOString();
  } catch {
    return null;
  }
}

function asIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function pickLatestIso(...values: Array<string | null | undefined>): string | null {
  const valid = values
    .map(asIsoOrNull)
    .filter((v): v is string => !!v)
    .map((v) => ({ iso: v, t: new Date(v).getTime() }));
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.t - a.t);
  return valid[0].iso;
}

async function readFileUpdateLog(): Promise<FileUpdateLog> {
  try {
    const redis = getRedisClient();
    const value = await redis.get<FileUpdateLog>(FILE_UPDATE_LOG_KEY);
    if (!value || typeof value !== 'object') return {};
    return value;
  } catch {
    return {};
  }
}

async function writeFileUpdateLog(nextLog: FileUpdateLog): Promise<void> {
  const redis = getRedisClient();
  await redis.set(FILE_UPDATE_LOG_KEY, nextLog);
}

function getManualLogTime(log: FileUpdateLog, key: string | undefined): string | null {
  if (!key) return null;
  const entry = log[key];
  if (!entry || typeof entry !== 'object') return null;
  if (entry.source !== 'manual') return null;
  return asIsoOrNull(entry.updatedAt);
}

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

function normalizeSql(sql: string): string {
  return sql
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
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
      sql: normalizeSql(raw),
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
      // non-fatal
    }
  }
  return examples;
}

export async function GET() {
  try {
    const cwd = process.cwd();
    const updateLog = await readFileUpdateLog();
    const timestampSnapshot: FileTimestampSnapshot =
      timestampSnapshotData && typeof timestampSnapshotData === 'object'
        ? (timestampSnapshotData as FileTimestampSnapshot)
        : {};
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = !isProduction;

    const fileRows = await Promise.all(
      DATA_FILES.map(async (item) => {
        const fullPath = path.join(cwd, item.relativePath);
        const rawUpdatedAt = await safeStatIso(fullPath);

        let sizeKb: number | null = null;
        let exists = false;

        if (rawUpdatedAt) {
          exists = true;
          try {
            const fileStat = await stat(fullPath);
            sizeKb = Number((fileStat.size / 1024).toFixed(1));
          } catch {
            sizeKb = null;
          }
        }

        // In deployed environments, uploaded raw files may not exist.
        // Fallback to derived source file timestamp so upload rows still show a meaningful update time.
        const sourceUpdatedAt =
          item.kind === 'upload' && item.source ? await safeStatIso(path.join(cwd, item.source)) : null;
        const loggedUpdatedAt =
          getManualLogTime(updateLog, item.relativePath) || getManualLogTime(updateLog, item.source);
        const snapshotUpdatedAt = asIsoOrNull(
          timestampSnapshot[item.relativePath] || (item.source ? timestampSnapshot[item.source] : null)
        );
        // Production: use explicit manual log only for both upload/derived rows.
        // If manual log is missing in production, use snapshot captured from development at deploy time.
        // Development: keep local file timestamp convenience.
        const updatedAt = isProduction
          ? pickLatestIso(loggedUpdatedAt, snapshotUpdatedAt)
          : pickLatestIso(rawUpdatedAt, sourceUpdatedAt, loggedUpdatedAt, snapshotUpdatedAt);

        return {
          ...item,
          exists,
          updatedAt,
          sizeKb,
        };
      })
    );

    const timestamps = fileRows
      .map((f) => (f.updatedAt ? new Date(f.updatedAt).getTime() : 0))
      .filter((t) => t > 0);
    const lastUpdatedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

    const sqlTables = isDevelopment
      ? await Promise.all(
          SQL_TABLES.map(async (table) => ({
            tableName: table.tableName,
            usedBy: table.usedBy,
            purpose: table.purpose,
            queryExamples: await buildQueryExamples(cwd, table),
          }))
        )
      : SQL_TABLES.map((table) => ({
          tableName: table.tableName,
          usedBy: table.usedBy,
          purpose: table.purpose,
        }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      lastUpdatedAt,
      files: fileRows,
      sqlTables,
      isDevelopment,
      notes: {
        uploadHistoryScope: isProduction
          ? 'Production: manual upload-log (Redis) first, fallback to deploy-time snapshot from development.'
          : 'Development: local file timestamps are shown and merged with upload-log timestamps.',
        sqlSourceScope: isDevelopment
          ? 'Development only: SQL query examples extracted from source files.'
          : 'Production: SQL table metadata only.',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to build data management status', message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminSecret = process.env.DATA_MANAGEMENT_SECRET || process.env.CRON_SECRET;
    if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const relativePath = String(body?.relativePath || '').trim();
    if (body?.action === 'clearUploadLogs') {
      await writeFileUpdateLog({});
      return NextResponse.json({ ok: true, action: 'clearUploadLogs' });
    }

    const requestedUpdatedAt = asIsoOrNull(body?.updatedAt || null) || new Date().toISOString();
    const matched = DATA_FILES.find((f) => f.relativePath === relativePath);
    if (!matched) {
      return NextResponse.json({ error: 'Unknown file path', relativePath }, { status: 400 });
    }

    const log = await readFileUpdateLog();
    log[relativePath] = { updatedAt: requestedUpdatedAt, source: 'manual' };
    if (matched.kind === 'upload' && matched.source) {
      log[matched.source] = { updatedAt: requestedUpdatedAt, source: 'manual' };
    }
    await writeFileUpdateLog(log);

    return NextResponse.json({
      ok: true,
      relativePath,
      updatedAt: requestedUpdatedAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update upload log', message: error.message }, { status: 500 });
  }
}
