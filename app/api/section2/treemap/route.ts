import { NextRequest, NextResponse } from 'next/server';
import { getSnapshot, setSnapshot, FALLBACK_TTL_SECONDS } from '@/lib/snapshotCache';
import { fetchSection2Treemap } from '@/lib/section2/treemap';
import { formatDateYYYYMMDD, getSection2StartDate } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section2/treemap
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * - mode: 'monthly' or 'ytd' (당월 or 누적)
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
    const mode = searchParams.get('mode') || 'monthly';
    const expectedCumStartDate = (() => {
      const asofDate = new Date(date);
      if (Number.isNaN(asofDate.getTime())) return '';
      if (mode === 'monthly') {
        return formatDateYYYYMMDD(new Date(asofDate.getFullYear(), asofDate.getMonth(), 1));
      }
      const startDate = new Date(getSection2StartDate(asofDate));
      startDate.setMonth(startDate.getMonth() - 6);
      return formatDateYYYYMMDD(startDate);
    })();

    // 요청 시작 로그
    console.log('[section2] 📥 Request START', {
      resource: 'treemap',
      region,
      brand,
      date,
      mode,
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
    // Note: mode는 스냅샷 키에 포함하지 않음 (Cron은 기본값만 생성)
    // 다른 mode 요청은 항상 MISS가 되어 fallback 처리
    const snapshot = await getSnapshot<any>('SECTION2', 'treemap', region, brand, date);

    if (
      snapshot &&
      snapshot.payload.mode === mode &&
      snapshot.payload.cum_start_date === expectedCumStartDate
    ) {
      // Redis HIT: 즉시 반환
      cacheHit = true;
      const durationMs = Date.now() - startTime;

      console.log('[section2] ✅ Request END - CACHE HIT', {
        resource: 'treemap',
        region,
        brand,
        date,
        mode,
        cache_hit: true,
        duration_ms: durationMs,
        generated_at: snapshot.meta.generated_at,
        compressed_kb: (snapshot.compressedBytes / 1024).toFixed(2),
      });

      return NextResponse.json(snapshot.payload);
    }

    console.log('[section2] ⏳ Cache MISS, executing Snowflake query...');

    // Redis MISS: Snowflake 쿼리 실행
    const snowflakeStart = Date.now();
    const payload = await fetchSection2Treemap({ region, brand, date, mode });
    snowflakeMs = Date.now() - snowflakeStart;

    // 결과를 Redis에 저장 (fallback TTL)
    try {
      await setSnapshot('SECTION2', 'treemap', region, brand, date, payload, FALLBACK_TTL_SECONDS);
    } catch (redisError: any) {
      console.error('[section2] ⚠️  Redis save failed (non-fatal):', redisError.message);
    }

    const durationMs = Date.now() - startTime;

    // MISS 로그 (운영 관측성)
    console.log('[section2] ✅ Request END - CACHE MISS', {
      resource: 'treemap',
      region,
      brand,
      date,
      mode,
      cache_hit: false,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs,
    });

    return NextResponse.json(payload);

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // 에러 로그 (운영 관측성)
    console.error('[section2] ❌ Request END - ERROR', {
      resource: 'treemap',
      cache_hit: cacheHit,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs > 0 ? snowflakeMs : undefined,
      error: error.message,
    });

    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
