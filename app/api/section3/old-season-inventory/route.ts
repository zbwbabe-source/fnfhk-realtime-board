import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { compressToB64, decompressFromB64 } from '@/lib/redisSnapshot';
import { executeSection3Query } from '@/lib/section3Query';
import {
  buildSection3OldSeasonCacheKey,
  SECTION3_CACHE_SCHEMA_VERSION,
} from '@/lib/section3-cache-key';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section3/old-season-inventory
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * Redis 캐시 우선 조회:
 * 1. Redis에서 캐시 확인 (cron 생성)
 * 2. HIT: 즉시 반환
 * 3. MISS: Snowflake 쿼리 실행 후 Redis 저장(24시간 TTL)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let cacheHit = false;
  let snowflakeMs = 0;
  let responseRowsCount = 0;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = (searchParams.get('region') || 'HKMC').trim();
    const brand = (searchParams.get('brand') || 'M').trim();
    const date = searchParams.get('date')?.trim() || '';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';
    const categoryFilter = (searchParams.get('category_filter') || 'all').trim() === 'clothes' ? 'clothes' : 'all';

    // 요청 시작 로그
      console.log('[section3] 📥 Request START', {
      region,
      brand,
      date,
      categoryFilter,
      force_refresh: forceRefresh,
      timestamp: new Date().toISOString(),
    });

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    // Redis 키 생성
    const cacheKey = buildSection3OldSeasonCacheKey(region, brand, date, categoryFilter);

    // Redis에서 캐시 조회
    try {
      const cached = forceRefresh ? null : await redis.get<string>(cacheKey);

      if (cached) {
        // Redis HIT: 압축 해제 후 반환
        cacheHit = true;
        const snapshot = await decompressFromB64<{
          asofDate: string;
          region: string;
          brand: string;
          generatedAt: string;
          payload: any;
        }>(cached);

        // 응답 rows 수 계산
        const payload = snapshot.payload;
        const hasCurrentStockYoY =
          payload &&
          payload.header &&
          Object.prototype.hasOwnProperty.call(payload.header, 'curr_stock_yoy_pct');
        const hasPeriodTagSales =
          payload &&
          payload.header &&
          Object.prototype.hasOwnProperty.call(payload.header, 'period_tag_sales');
        const hasPeriodActSales =
          payload &&
          payload.header &&
          Object.prototype.hasOwnProperty.call(payload.header, 'period_act_sales');

        if (hasCurrentStockYoY && hasPeriodTagSales && hasPeriodActSales) {
          responseRowsCount = Array.isArray(payload) ? payload.length : 0;
          const durationMs = Date.now() - startTime;

          // HIT 로그 (운영 관찰성)
      console.log('[section3] ✅ Request END - CACHE HIT', {
        region,
        brand,
        date,
        cache_schema_version: SECTION3_CACHE_SCHEMA_VERSION,
        cache_hit: true,
        key: cacheKey,
        duration_ms: durationMs,
            generated_at: snapshot.generatedAt,
            response_rows_count: responseRowsCount,
            compressed_kb: (cached.length / 1024).toFixed(2),
          });

          return NextResponse.json(snapshot.payload);
        }

        console.log('[section3] Cache payload outdated, regenerating snapshot...', { key: cacheKey });
      }

      console.log('[section3] ⚠️ Cache MISS, executing Snowflake query...', { key: cacheKey });
    } catch (redisError: any) {
      console.error('[section3] ❌ Redis error (non-fatal):', redisError.message);
      // Redis 오류 시 fallback으로 Snowflake 쿼리 실행
    }

    // Redis MISS: Snowflake 쿼리 실행
    const snowflakeStart = Date.now();
    const payload = await executeSection3Query(region, brand, date, { categoryFilter });
    snowflakeMs = Date.now() - snowflakeStart;
    
    // 응답 rows 수 계산
    responseRowsCount = Array.isArray(payload) ? payload.length : 0;

    // 결과를 Redis에 저장(24시간 TTL)
    try {
      const snapshotData = {
        asofDate: date,
        region,
        brand,
        generatedAt: new Date().toISOString(),
        payload,
      };

      const compressedValue = await compressToB64(snapshotData);
      const ttlSeconds = 60 * 60 * 24; // 24시간 (fallback TTL)

      await redis.set(cacheKey, compressedValue, { ex: ttlSeconds });

      console.log('[section3] 💾 Redis SET success', {
        key: cacheKey,
        compressed_kb: (compressedValue.length / 1024).toFixed(2),
        ttl_seconds: ttlSeconds,
      });
    } catch (redisError: any) {
      console.error('[section3] ❌ Redis save failed (non-fatal):', redisError.message);
      // Redis 저장 실패해도 응답은 정상 반환
    }

    const durationMs = Date.now() - startTime;
    
    // MISS 로그 (운영 관찰성)
    console.log('[section3] ✅ Request END - CACHE MISS', {
      region,
      brand,
      date,
      cache_schema_version: SECTION3_CACHE_SCHEMA_VERSION,
      cache_hit: false,
      key: cacheKey,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs,
      response_rows_count: responseRowsCount,
    });

    return NextResponse.json(payload);

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    // 에러 로그 (운영 관찰성)
    console.error('[section3] ❌ Request END - ERROR', {
      cache_hit: cacheHit,
      duration_ms: durationMs,
      snowflake_ms: snowflakeMs > 0 ? snowflakeMs : undefined,
      error: error.message,
    });
    
    return NextResponse.json(
      {
        error: 'Failed to fetch old season inventory data',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
