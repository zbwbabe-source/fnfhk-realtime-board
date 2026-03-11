import { NextRequest, NextResponse } from 'next/server';
import { getSnapshot, setSnapshot, FALLBACK_TTL_SECONDS } from '@/lib/snapshotCache';
import { fetchSection1StoreSales } from '@/lib/section1/store-sales';

export const dynamic = 'force-dynamic';

function isLegacySnapshotPayload(payload: any): boolean {
  const total = payload?.total_subtotal;
  return (
    !payload?.season_category_sales?.metrics ||
    !total ||
    !payload?.projection_meta ||
    typeof total.same_store_yoy === 'undefined' ||
    typeof total.active_store_count_mtd === 'undefined' ||
    typeof total.active_store_count_mtd_py === 'undefined' ||
    typeof total.active_store_count_ytd_avg === 'undefined' ||
    typeof total.active_store_count_ytd_avg_py === 'undefined' ||
    typeof total.projected_progress === 'undefined' ||
    typeof total.projected_progress_ytd === 'undefined' ||
    typeof total.ytdMonthEndProjection === 'undefined' ||
    typeof total.ytdProjectedYoY === 'undefined'
  );
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
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    // 요청 시작 로그
    console.log('[section1] 📥 Request START', {
      resource: 'store-sales',
      region,
      brand,
      date,
      force_refresh: forceRefresh,
      timestamp: new Date().toISOString(),
    });

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Redis 스냅샷 조회 (forceRefresh면 skip)
    const snapshot = forceRefresh
      ? null
      : await getSnapshot<any>('SECTION1', 'store-sales', region, brand, date);

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
      console.log('[section1] Legacy snapshot detected, regenerating', { region, brand, date });
    }

    console.log('[section1] ⏳ Cache MISS, executing Snowflake query...');

    // Redis MISS: Snowflake 쿼리 실행
    const snowflakeStart = Date.now();
    const payload = await fetchSection1StoreSales({ region, brand, date });
    snowflakeMs = Date.now() - snowflakeStart;

    // 결과를 Redis에 저장 (fallback TTL)
    try {
      await setSnapshot('SECTION1', 'store-sales', region, brand, date, payload, FALLBACK_TTL_SECONDS);
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
