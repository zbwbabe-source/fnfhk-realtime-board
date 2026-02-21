import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { getRedisClient } from '@/lib/cache';

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
};

type FileUpdateLog = Record<string, string>;
type FileHashLog = Record<string, string>;

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
  },
  {
    tableName: 'SAP_FNF.DW_HMD_STOCK_SNAP_D',
    usedBy: ['/api/section2/sellthrough', '/api/section3/old-season-inventory'],
    purpose: 'Stock snapshot table',
  },
  {
    tableName: 'SAP_FNF.PREP_HMD_STOCK',
    usedBy: ['/api/section2/sellthrough', '/api/section3/old-season-inventory'],
    purpose: 'Pre-aggregated stock table',
  },
];

const FILE_UPDATE_LOG_KEY = 'fnfhk:data-management:file-updated-at';
const FILE_HASH_LOG_KEY = 'fnfhk:data-management:file-content-hash';

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

async function readFileHashLog(): Promise<FileHashLog> {
  try {
    const redis = getRedisClient();
    const value = await redis.get<FileHashLog>(FILE_HASH_LOG_KEY);
    if (!value || typeof value !== 'object') return {};
    return value;
  } catch {
    return {};
  }
}

async function writeFileHashLog(nextLog: FileHashLog): Promise<void> {
  const redis = getRedisClient();
  await redis.set(FILE_HASH_LOG_KEY, nextLog);
}

async function safeContentHash(filePath: string): Promise<string | null> {
  try {
    const raw = await readFile(filePath);
    return createHash('sha1').update(raw).digest('hex');
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const cwd = process.cwd();
    const updateLog = await readFileUpdateLog();
    const hashLog = await readFileHashLog();
    let shouldWriteUpdateLog = false;
    let shouldWriteHashLog = false;
    const nowIso = new Date().toISOString();

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
        const loggedUpdatedAt = updateLog[item.relativePath] || (item.source ? updateLog[item.source] : null);

        const hashTargetRelPath =
          rawUpdatedAt ? item.relativePath : item.kind === 'upload' && item.source ? item.source : item.relativePath;
        const hashTargetAbsPath = path.join(cwd, hashTargetRelPath);
        const contentHash = await safeContentHash(hashTargetAbsPath);
        if (contentHash) {
          const prevHash = hashLog[hashTargetRelPath];
          if (!prevHash || prevHash !== contentHash) {
            hashLog[hashTargetRelPath] = contentHash;
            updateLog[item.relativePath] = nowIso;
            if (item.source) updateLog[item.source] = nowIso;
            shouldWriteHashLog = true;
            shouldWriteUpdateLog = true;
          }
        }

        // Prefer whichever is newer among detected file timestamp and persisted upload log.
        let updatedAt = pickLatestIso(rawUpdatedAt, sourceUpdatedAt, updateLog[item.relativePath], loggedUpdatedAt);
        if (!updatedAt && item.kind === 'upload' && item.source) {
          const sourcePath = path.join(cwd, item.source);
          updatedAt = await safeStatIso(sourcePath);
        }

        return {
          ...item,
          exists,
          updatedAt,
          sizeKb,
        };
      })
    );

    if (shouldWriteHashLog) {
      await writeFileHashLog(hashLog);
    }
    if (shouldWriteUpdateLog) {
      await writeFileUpdateLog(updateLog);
    }

    const timestamps = fileRows
      .map((f) => (f.updatedAt ? new Date(f.updatedAt).getTime() : 0))
      .filter((t) => t > 0);
    const lastUpdatedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      lastUpdatedAt,
      files: fileRows,
      sqlTables: SQL_TABLES,
      notes: {
        uploadHistoryScope: 'Shows latest detectable timestamp for each upload/derived file. In deployment, persisted upload log (Redis) is used when filesystem timestamps are unavailable.',
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
    const requestedUpdatedAt = asIsoOrNull(body?.updatedAt || null) || new Date().toISOString();
    const matched = DATA_FILES.find((f) => f.relativePath === relativePath);
    if (!matched) {
      return NextResponse.json({ error: 'Unknown file path', relativePath }, { status: 400 });
    }

    const log = await readFileUpdateLog();
    log[relativePath] = requestedUpdatedAt;
    if (matched.kind === 'upload' && matched.source) {
      log[matched.source] = requestedUpdatedAt;
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
