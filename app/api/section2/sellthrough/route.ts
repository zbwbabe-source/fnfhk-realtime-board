import { NextRequest, NextResponse } from 'next/server';
import { getSnapshot, setSnapshot, FALLBACK_TTL_SECONDS } from '@/lib/snapshotCache';
import { fetchSection2Sellthrough } from '@/lib/section2/sellthrough';

export const dynamic = 'force-dynamic';

function isLegacySnapshotPayload(payload: any): boolean {
  const firstCategory = payload?.categories?.[0];
  if (!firstCategory) return false;
  return (
    firstCategory.cum_basis !== 'season_minus_6m' ||
    firstCategory.period_scope !== 'season' ||
    typeof payload?.cum_start_date === 'undefined' ||
    typeof firstCategory.sales_act === 'undefined' ||
    typeof firstCategory.mtd_sales_tag === 'undefined' ||
    typeof firstCategory.mtd_sales_yoy_pct === 'undefined' ||
    typeof firstCategory.mtd_discount_rate === 'undefined' ||
    typeof firstCategory.mtd_discount_rate_diff === 'undefined' ||
    typeof firstCategory.sales_yoy_pct === 'undefined' ||
    typeof firstCategory.discount_rate === 'undefined' ||
    typeof firstCategory.discount_rate_diff === 'undefined'
  );
}

/**
 * GET /api/section2/sellthrough
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * - category_filter: 'clothes' (의류만) or 'all' (전체 카테고리) - 기본값: 'clothes'
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
    const categoryFilter =
      (searchParams.get('category_filter') || 'clothes').trim() === 'all' ? 'all' : 'clothes';

    // 요청 시작 로그
    console.log('[section2] 📥 Request START', {
      resource: 'sellthrough',
      region,
      brand,
      date,
      force_refresh: forceRefresh,
      category_filter: categoryFilter,
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

    // Redis 스냅샷 조회 (필터별 키 분리)
    const snapshotResource = `sellthrough:${categoryFilter}`;
    const snapshot = forceRefresh
      ? null
      : await getSnapshot<any>('SECTION2', snapshotResource, region, brand, date);

    if (snapshot && !isLegacySnapshotPayload(snapshot.payload)) {
      // Redis HIT: 즉시 반환
      cacheHit = true;
      const durationMs = Date.now() - startTime;

      console.log('[section2] ✅ Request END - CACHE HIT', {
        resource: 'sellthrough',
        region,
        brand,
        date,
        category_filter: categoryFilter,
        cache_hit: true,
        duration_ms: durationMs,
        generated_at: snapshot.meta.generated_at,
        compressed_kb: (snapshot.compressedBytes / 1024).toFixed(2),
      });

      return NextResponse.json(snapshot.payload);
    }

    if (snapshot && isLegacySnapshotPayload(snapshot.payload)) {
      console.log('[section2] Legacy snapshot detected, regenerating', { region, brand, date, categoryFilter });
    }

    console.log('[section2] ⏳ Cache MISS, executing Snowflake query...');

    // Redis MISS: Snowflake 쿼리 실행
    const snowflakeStart = Date.now();
    const payload = await fetchSection2Sellthrough({ region, brand, date, categoryFilter });
    snowflakeMs = Date.now() - snowflakeStart;

    // 결과를 Redis에 저장 (fallback TTL)
    try {
      await setSnapshot('SECTION2', snapshotResource, region, brand, date, payload, FALLBACK_TTL_SECONDS);
    } catch (redisError: any) {
      console.error('[section2] ⚠️  Redis save failed (non-fatal):', redisError.message);
    }

    const durationMs = Date.now() - startTime;

    // MISS 로그 (운영 관측성)
    console.log('[section2] ✅ Request END - CACHE MISS', {
      resource: 'sellthrough',
      region,
      brand,
      date,
      category_filter: categoryFilter,
      cache_hit: false,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs,
    });

    return NextResponse.json(payload);

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // 에러 로그 (운영 관측성)
    console.error('[section2] ❌ Request END - ERROR', {
      resource: 'sellthrough',
      cache_hit: cacheHit,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs > 0 ? snowflakeMs : undefined,
      error: error.message,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch sell-through data',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
