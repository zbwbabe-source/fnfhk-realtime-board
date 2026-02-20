import { NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import path from 'path';

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

async function safeStatIso(filePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.mtime.toISOString();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const cwd = process.cwd();

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
        let updatedAt = rawUpdatedAt;
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
        uploadHistoryScope: 'Shows latest detectable timestamp for each upload/derived file. Upload rows fallback to derived source timestamp when raw file is unavailable in deployment.',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to build data management status', message: error.message }, { status: 500 });
  }
}
