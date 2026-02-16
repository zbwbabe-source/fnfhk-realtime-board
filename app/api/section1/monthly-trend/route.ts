import { NextRequest, NextResponse } from 'next/server';
import { getSnapshot, setSnapshot, FALLBACK_TTL_SECONDS } from '@/lib/snapshotCache';
import { fetchSection1MonthlyTrend } from '@/lib/section1/monthly-trend';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section1/monthly-trend
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

    // 요청 시작 로그
    console.log('[section1] 📥 Request START', {
      resource: 'monthly-trend',
      region,
      brand,
      date,
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

    // Redis 스냅샷 조회
    const snapshot = await getSnapshot<any>('SECTION1', 'monthly-trend', region, brand, date);

    if (snapshot) {
      // Redis HIT: 즉시 반환
      cacheHit = true;
      const durationMs = Date.now() - startTime;

      console.log('[section1] ✅ Request END - CACHE HIT', {
        resource: 'monthly-trend',
        region,
        brand,
        date,
        cache_hit: true,
        duration_ms: durationMs,
        generated_at: snapshot.meta.generated_at,
        response_rows_count: snapshot.payload?.rows?.length || 0,
        compressed_kb: (snapshot.compressedBytes / 1024).toFixed(2),
      });

      return NextResponse.json(snapshot.payload);
    }

    console.log('[section1] ⏳ Cache MISS, executing Snowflake query...');

    // Redis MISS: Snowflake 쿼리 실행
    const snowflakeStart = Date.now();
    const payload = await fetchSection1MonthlyTrend({ region, brand, date });
    snowflakeMs = Date.now() - snowflakeStart;

    // 결과를 Redis에 저장 (fallback TTL)
    try {
      await setSnapshot('SECTION1', 'monthly-trend', region, brand, date, payload, FALLBACK_TTL_SECONDS);
    } catch (redisError: any) {
      console.error('[section1] ⚠️  Redis save failed (non-fatal):', redisError.message);
    }

    const durationMs = Date.now() - startTime;

    // MISS 로그 (운영 관측성)
    console.log('[section1] ✅ Request END - CACHE MISS', {
      resource: 'monthly-trend',
      region,
      brand,
      date,
      cache_hit: false,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs,
      response_rows_count: payload?.rows?.length || 0,
    });

    return NextResponse.json(payload);

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // 에러 로그 (운영 관측성)
    console.error('[section1] ❌ Request END - ERROR', {
      resource: 'monthly-trend',
      cache_hit: cacheHit,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs > 0 ? snowflakeMs : undefined,
      error: error.message,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch monthly trend',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
