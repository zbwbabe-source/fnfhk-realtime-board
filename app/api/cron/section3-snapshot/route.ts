import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { compressToB64 } from '@/lib/redisSnapshot';
import { executeSection3Query } from '@/lib/section3Query';
import { buildSnapshotTargetDates, getYesterday } from '@/lib/date-utils';
import {
  buildSection3OldSeasonCacheKey,
  SECTION3_CACHE_SCHEMA_VERSION,
} from '@/lib/section3-cache-key';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

/**
 * Vercel Cron Job: Section3 Snapshot
 * 
 * Schedule: 매일 05:00 KST (= 전날 20:00 UTC)
 * Protection: secret parameter or x-cron-secret header
 * 
 * 작업 내용:
 * - Section3(과시즌 소진) 데이터를 Redis 스냅샷으로 저장
 * - Region: HKMC, TW
 * - Brand: M, X
 * - TTL: 72시간 (기본) 또는 14일 (N일 스냅샷 시)
 * 
 * 환경변수:
 * - SECTION3_SNAPSHOT_DAYS: 생성할 과거 날짜 수 (기본 1, 최대 30)
 * - SECTION3_CRON_PARALLEL: 병렬 실행 여부 (1=병렬, 0=직렬, 기본 0)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 보안 검증: Authorization / x-cron-secret / secret 파라미터 모두 허용
  if (!isAuthorizedCronRequest(request)) {
    console.error('❌ [section3-cron] Unauthorized access attempt');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // 환경변수 읽기
    const snapshotDays = Math.min(Math.max(1, parseInt(process.env.SECTION3_SNAPSHOT_DAYS || '1', 10)), 30);
    const snapshotMonthEnds = Math.min(
      Math.max(0, parseInt(process.env.SECTION3_SNAPSHOT_MONTH_ENDS || '3', 10)),
      24
    );
    const isParallel = process.env.SECTION3_CRON_PARALLEL === '1';
    
    // KST 기준 어제 날짜
    const yesterday = getYesterday();
    
    // 생성할 날짜 목록 (어제부터 N일 전까지)
    const targetDates = buildSnapshotTargetDates(yesterday, snapshotDays, snapshotMonthEnds);

    // Region/Brand 조합
    const regions = ['HKMC', 'TW'];
    const brands = ['M', 'X'];
    const categoryFilters: Array<'clothes' | 'all'> = ['clothes', 'all'];
    
    // TTL 설정: 1일치면 72시간, 여러 날짜면 14일
    const ttlSeconds = snapshotDays === 1 ? 60 * 60 * 72 : 60 * 60 * 24 * 14;

    // 실행 시작 로그
    console.log('[section3-cron] 🔄 Snapshot generation START', {
      dates: targetDates,
      regions,
      brands,
      category_filters: categoryFilters,
      cache_schema_version: SECTION3_CACHE_SCHEMA_VERSION,
      days_to_generate: snapshotDays,
      month_ends_to_generate: snapshotMonthEnds,
      parallel: isParallel,
      ttl_hours: ttlSeconds / 3600,
      timestamp: new Date().toISOString(),
    });

    const saved: Array<{ 
      key: string; 
      bytes: number; 
      region: string; 
      brand: string; 
      date: string;
      category_filter: 'clothes' | 'all';
    }> = [];
    const errors: Array<{ 
      region: string; 
      brand: string; 
      date: string;
      category_filter: 'clothes' | 'all';
      error: string;
    }> = [];

    // 스냅샷 생성 함수
    const generateSnapshot = async (
      region: string,
      brand: string,
      date: string,
      categoryFilter: 'clothes' | 'all'
    ) => {
      try {
        console.log(`  📊 [section3-cron] Processing ${region}:${brand}:${date}:${categoryFilter}...`);

        // Section3 쿼리 실행
        const payload = await executeSection3Query(region, brand, date, { categoryFilter });

        // Redis 키 생성
        const key = buildSection3OldSeasonCacheKey(region, brand, date, categoryFilter);

        // 스냅샷 데이터 준비
        const snapshotData = {
          asofDate: date,
          region,
          brand,
          generatedAt: new Date().toISOString(),
          payload,
        };

        // gzip 압축 후 base64 인코딩
        const compressedValue = await compressToB64(snapshotData);
        const bytes = compressedValue.length;

        // Redis에 저장
        await redis.set(key, compressedValue, { ex: ttlSeconds });

        saved.push({ key, bytes, region, brand, date, category_filter: categoryFilter });
        console.log(`    ✅ [section3-cron] Saved: ${key} (${(bytes / 1024).toFixed(2)} KB)`);
      } catch (error: any) {
        console.error(`    ❌ [section3-cron] Error for ${region}:${brand}:${date}:${categoryFilter}:`, error.message);
        errors.push({
          region,
          brand,
          date,
          category_filter: categoryFilter,
          error: error.message,
        });
      }
    };

    // 병렬 또는 직렬 실행
    if (isParallel) {
      // 병렬 실행
      const tasks: Promise<void>[] = [];
      for (const date of targetDates) {
        for (const region of regions) {
          for (const brand of brands) {
            for (const categoryFilter of categoryFilters) {
              tasks.push(generateSnapshot(region, brand, date, categoryFilter));
            }
          }
        }
      }
      await Promise.all(tasks);
    } else {
      // 직렬 실행 (기본)
      for (const date of targetDates) {
        for (const region of regions) {
          for (const brand of brands) {
            for (const categoryFilter of categoryFilters) {
              await generateSnapshot(region, brand, date, categoryFilter);
            }
          }
        }
      }
    }

    // 완료 통계
    const durationMs = Date.now() - startTime;
    const totalBytes = saved.reduce((sum, item) => sum + item.bytes, 0);
    const totalTargets = targetDates.length * regions.length * brands.length * categoryFilters.length;
    const successCount = saved.length;
    const errorCount = errors.length;

    const result = {
      ok: errors.length === 0,
      dates: targetDates,
      saved,
      errors,
      stats: {
        total_targets: totalTargets,
        success_count: successCount,
        error_count: errorCount,
        total_bytes: totalBytes,
        total_kb: (totalBytes / 1024).toFixed(2),
        duration_ms: durationMs,
      },
    };

    // 요약 로그 (운영 관측성)
    if (errorCount > 0) {
      console.error('[section3-cron] ⚠️  Snapshot generation COMPLETED WITH ERRORS', {
        total_targets: totalTargets,
        success_count: successCount,
        error_count: errorCount,
        total_kb: result.stats.total_kb,
        duration_ms: durationMs,
        errors: errors.map(e => `${e.region}:${e.brand}:${e.date}:${e.category_filter}`),
      });
    } else {
      console.log('[section3-cron] ✅ Snapshot generation SUCCESS', {
        total_targets: totalTargets,
        success_count: successCount,
        error_count: errorCount,
        total_kb: result.stats.total_kb,
        duration_ms: durationMs,
      });
    }

    return NextResponse.json(result, {
      status: errors.length > 0 ? 207 : 200,
    });
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    console.error('[section3-cron] ❌ FATAL ERROR', {
      duration_ms: durationMs,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
    
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
