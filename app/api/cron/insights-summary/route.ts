import { NextRequest, NextResponse } from 'next/server';
import { getYesterday, formatDateYYYYMMDD } from '@/lib/date-utils';
import { fetchSection1StoreSales } from '@/lib/section1/store-sales';
import { fetchSection2Sellthrough } from '@/lib/section2/sellthrough';
import { executeSection3Query } from '@/lib/section3Query';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const LAST_RUN_KEY = 'fnfhk:OPS:cron:last_run:insights-summary';
const LAST_RUN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type JobResult = {
  region: string;
  brand: string;
  date: string;
  status: 'ok' | 'error';
  duration_ms: number;
  error?: string;
};

async function prewarmSummary(
  request: NextRequest,
  region: string,
  brand: string,
  date: string
): Promise<JobResult> {
  const startedAt = Date.now();

  try {
    const section1 = await fetchSection1StoreSales({ region, brand, date });
    const section2 = await fetchSection2Sellthrough({
      region,
      brand,
      date,
      categoryFilter: 'clothes',
    });
    const section3 = await executeSection3Query(region, brand, date);

    const asofDate = new Date(date);
    const elapsedDays = asofDate.getDate();
    const totalDays = new Date(asofDate.getFullYear(), asofDate.getMonth() + 1, 0).getDate();

    const body = {
      region,
      brand,
      asof_date: date,
      section1: {
        achievement_rate: section1.total_subtotal?.progress || 0,
        yoy_ytd: section1.total_subtotal?.yoy || 0,
        actual_sales_ytd: section1.total_subtotal?.mtd_act || 0,
        target_ytd: section1.total_subtotal?.target_mth || 0,
        elapsed_days: elapsedDays,
        total_days: totalDays,
      },
      section2: {
        sellthrough_rate: section2.header?.overall_sellthrough || 0,
        sales_amt: section2.header?.total_sales || 0,
        inbound_amt: section2.header?.total_inbound || 0,
        sales_yoy_pct: section2.header?.sales_yoy_pct || 100,
      },
      section3: {
        sellthrough_rate:
          (section3.header?.base_stock_amt || 0) > 0
            ? (((section3.header?.base_stock_amt || 0) - (section3.header?.curr_stock_amt || 0)) /
                (section3.header?.base_stock_amt || 1)) *
              100
            : 0,
        base_stock_amt: section3.header?.base_stock_amt || 0,
        curr_stock_amt: section3.header?.curr_stock_amt || 0,
        stagnant_ratio: section3.header?.stagnant_ratio || 0,
        prev_month_stagnant_ratio: section3.header?.prev_month_stagnant_ratio || 0,
      },
    };

    const summaryUrl = new URL('/api/insights/summary', request.url).toString();
    const response = await fetch(summaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`summary prewarm failed: ${response.status} ${message}`);
    }

    return {
      region,
      brand,
      date,
      status: 'ok',
      duration_ms: Date.now() - startedAt,
    };
  } catch (error: any) {
    return {
      region,
      brand,
      date,
      status: 'error',
      duration_ms: Date.now() - startedAt,
      error: error.message,
    };
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  const secretFromParam = request.nextUrl.searchParams.get('secret');
  const secretFromHeader = request.headers.get('x-cron-secret');
  const envSecret = process.env.CRON_SECRET;

  if (!envSecret || (secretFromParam !== envSecret && secretFromHeader !== envSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshotDays = Math.min(
    Math.max(1, parseInt(process.env.SUMMARY_SNAPSHOT_DAYS || '3', 10)),
    30
  );
  const isParallel = process.env.SUMMARY_CRON_PARALLEL !== '0';

  const yesterday = getYesterday();
  const targetDates: string[] = [];
  for (let i = 0; i < snapshotDays; i += 1) {
    const date = new Date(yesterday);
    date.setDate(date.getDate() - i);
    targetDates.push(formatDateYYYYMMDD(date));
  }

  const regions = ['HKMC', 'TW'];
  const brands = ['M', 'X'];
  const tasks: Array<Promise<JobResult>> = [];
  const results: JobResult[] = [];

  for (const date of targetDates) {
    for (const region of regions) {
      for (const brand of brands) {
        if (isParallel) {
          tasks.push(prewarmSummary(request, region, brand, date));
        } else {
          // eslint-disable-next-line no-await-in-loop
          results.push(await prewarmSummary(request, region, brand, date));
        }
      }
    }
  }

  if (isParallel) {
    results.push(...(await Promise.all(tasks)));
  }

  const successCount = results.filter((r) => r.status === 'ok').length;
  const errorRows = results.filter((r) => r.status === 'error');
  const durationMs = Date.now() - startedAt;

  try {
    await redis.set(
      LAST_RUN_KEY,
      {
        timestamp: new Date().toISOString(),
        success_count: successCount,
        error_count: errorRows.length,
        duration_ms: durationMs,
      },
      { ex: LAST_RUN_TTL_SECONDS }
    );
  } catch (error: any) {
    // Non-fatal: cron should still return result even if OPS metadata fails.
    console.error('[OPS] failed to save cron last_run metadata', error.message);
  }

  const response = {
    ok: errorRows.length === 0,
    generated: results,
    stats: {
      total_targets: results.length,
      success_count: successCount,
      error_count: errorRows.length,
      duration_ms: durationMs,
      days: snapshotDays,
      parallel: isParallel,
    },
  };

  return NextResponse.json(response, { status: errorRows.length > 0 ? 207 : 200 });
}
