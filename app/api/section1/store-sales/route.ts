import { NextRequest, NextResponse } from 'next/server';
import { getSnapshot, setSnapshot, FALLBACK_TTL_SECONDS } from '@/lib/snapshotCache';
import { fetchSection1StoreSales } from '@/lib/section1/store-sales';

export const dynamic = 'force-dynamic';

const DAILY_YOY_BASIS = 'last_year_same_weekday_364d';

function isLegacySnapshotPayload(payload: any): boolean {
  const total = payload?.total_subtotal;
  const expectedSameStoreFilterRule = 'exclude_offline_mtd_zero_sales_days_ge_5';
  const hasTargetLocalFields = (() => {
    const storeGroups = [
      payload?.hk_normal,
      payload?.hk_outlet,
      payload?.hk_online,
      payload?.mc_normal,
      payload?.mc_outlet,
      payload?.mc_online,
      payload?.tw_normal,
      payload?.tw_outlet,
      payload?.tw_online,
    ];
    const firstStore = storeGroups.find((group) => Array.isArray(group) && group.length > 0)?.[0];
    if (!firstStore) return false;
    return (
      typeof firstStore.target_mth_local !== 'undefined' &&
      typeof firstStore.ytd_target_local !== 'undefined' &&
      typeof total?.target_mth_local !== 'undefined' &&
      typeof total?.ytd_target_local !== 'undefined'
    );
  })();
  return (
    !payload?.season_category_sales?.metrics ||
    !total ||
    !payload?.projection_meta ||
    typeof payload?.base_month === 'undefined' ||
    typeof payload?.forecast_source === 'undefined' ||
    !Array.isArray(payload?.forecast_months) ||
    typeof total.same_store_yoy === 'undefined' ||
    typeof total.active_store_count_mtd === 'undefined' ||
    typeof total.active_store_count_mtd_py === 'undefined' ||
    typeof total.same_store_filter_rule === 'undefined' ||
    total.same_store_filter_rule !== expectedSameStoreFilterRule ||
    typeof total.active_store_count_ytd_avg === 'undefined' ||
    typeof total.active_store_count_ytd_avg_py === 'undefined' ||
    typeof total.projected_progress === 'undefined' ||
    typeof total.projected_progress_ytd === 'undefined' ||
    typeof total.ytdMonthEndProjection === 'undefined' ||
    typeof total.ytdProjectedYoY === 'undefined' ||
    typeof total.ytd_projection_basis === 'undefined' ||
    total.ytd_projection_basis !== 'current_month_end' ||
    typeof total.daily_yoy === 'undefined' ||
    !Array.isArray(total.daily_yoy_trend) ||
    total.daily_yoy_trend_basis !== 'rolling_daily_with_ytd' ||
    typeof total.recent_7d_yoy === 'undefined' ||
    typeof total.forecast_source === 'undefined' ||
    !Array.isArray(total.forecast_months) ||
    !hasTargetLocalFields
    || total.daily_yoy_basis !== DAILY_YOY_BASIS
  );
}

function formatKstDate(value: Date): string {
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isRecentAsOfDate(requestedDate?: string): boolean {
  if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return false;

  const now = new Date();
  const todayKst = formatKstDate(now);
  const yesterdayKst = formatKstDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  return requestedDate === todayKst || requestedDate === yesterdayKst;
}

/**
 * GET /api/section1/store-sales
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * Redis 스냅샷 우선 조회:
 * 1. Redis에서 스냅샷 확인 (cron 생성)
 * 2. HIT: 즉시 반환
 * 3. MISS: Snowflake 쿼리 실행 후 Redis 저장 (24시간 TTL)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let cacheHit = false;
  let snowflakeMs = 0;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';
    const baseMonth = searchParams.get('base_month') || '';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    // 요청 시작 로그
    console.log('[section1] 📥 Request START', {
      resource: 'store-sales',
      region,
      brand,
      date,
      base_month: baseMonth || undefined,
      force_refresh: forceRefresh,
      timestamp: new Date().toISOString(),
    });

    if (!date && !baseMonth) {
      return NextResponse.json(
        { error: 'Missing required parameter: date or base_month' },
        { status: 400 }
      );
    }

    if (date && !date.match(/^\d{4}-\d{2}(-\d{2})?$/)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD or YYYY-MM' },
        { status: 400 }
      );
    }

    if (baseMonth && !baseMonth.match(/^\d{4}-\d{2}$/)) {
      return NextResponse.json(
        { error: 'Invalid base_month format. Expected YYYY-MM' },
        { status: 400 }
      );
    }

    // Redis 스냅샷 조회 (forceRefresh면 skip)
    const shouldBypassRecentSnapshot = !baseMonth && isRecentAsOfDate(date);
    const snapshot =
      forceRefresh || shouldBypassRecentSnapshot
        ? null
        : await getSnapshot<any>('SECTION1', 'store-sales', region, brand, baseMonth || date);

    if (snapshot && !isLegacySnapshotPayload(snapshot.payload)) {
      // Redis HIT: 즉시 반환
      cacheHit = true;
      const durationMs = Date.now() - startTime;

      console.log('[section1] ✅ Request END - CACHE HIT', {
        resource: 'store-sales',
        region,
        brand,
        date,
        cache_hit: true,
        duration_ms: durationMs,
        generated_at: snapshot.meta.generated_at,
        compressed_kb: (snapshot.compressedBytes / 1024).toFixed(2),
      });

      return NextResponse.json(snapshot.payload);
    }

    if (snapshot && isLegacySnapshotPayload(snapshot.payload)) {
      console.log('[section1] Legacy snapshot detected, regenerating', { region, brand, date, baseMonth });
    }

    if (shouldBypassRecentSnapshot) {
      console.log('[section1] Recent as-of date bypasses snapshot cache', {
        region,
        brand,
        date,
      });
    }

    console.log('[section1] ⏳ Cache MISS, executing Snowflake query...');

    // Redis MISS: Snowflake 쿼리 실행
    const snowflakeStart = Date.now();
    const payload = await fetchSection1StoreSales({ region, brand, date, baseMonth });
    snowflakeMs = Date.now() - snowflakeStart;

    // 결과를 Redis에 저장 (fallback TTL)
    try {
      await setSnapshot('SECTION1', 'store-sales', region, brand, baseMonth || payload.asof_date, payload, FALLBACK_TTL_SECONDS);
    } catch (redisError: any) {
      console.error('[section1] ⚠️  Redis save failed (non-fatal):', redisError.message);
    }

    const durationMs = Date.now() - startTime;

    // MISS 로그 (운영 관측성)
    console.log('[section1] ✅ Request END - CACHE MISS', {
      resource: 'store-sales',
      region,
      brand,
      date,
      base_month: baseMonth || undefined,
      cache_hit: false,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs,
    });

    return NextResponse.json(payload);

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // 에러 로그 (운영 관측성)
    console.error('[section1] ❌ Request END - ERROR', {
      resource: 'store-sales',
      cache_hit: cacheHit,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs > 0 ? snowflakeMs : undefined,
      error: error.message,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch store sales data',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
