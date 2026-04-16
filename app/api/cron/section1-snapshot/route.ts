import { NextRequest, NextResponse } from 'next/server';
import { setSnapshot, SNAPSHOT_TTL_SECONDS } from '@/lib/snapshotCache';
import { fetchSection1MonthlyTrend } from '@/lib/section1/monthly-trend';
import { fetchSection1StoreSales } from '@/lib/section1/store-sales';
import { buildSnapshotTargetDates, getYesterday } from '@/lib/date-utils';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

/**
 * Vercel Cron Job: Section1 Snapshot
 * 
 * Schedule: 매일 05:00 KST (= 전날 20:00 UTC)
 * Protection: secret parameter or x-cron-secret header
 * 
 * 작업 내용:
 * - Section1 데이터를 Redis 스냅샷으로 저장
 * - Region: HKMC, TW
 * - Brand: M, X
 * - Resources: monthly-trend, store-sales
 * - TTL: 72시간 (기본)
 * 
 * 환경변수:
 * - SECTION_SNAPSHOT_DAYS: 생성할 과거 날짜 수 (기본 1, 최대 30)
 * - SECTION_CRON_PARALLEL: 병렬 실행 여부 (1=병렬, 0=직렬, 기본 0)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 보안 검증: Authorization / x-cron-secret / secret 파라미터 모두 허용
  if (!isAuthorizedCronRequest(request)) {
    console.error('❌ [section1-cron] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 환경변수 읽기
    const snapshotDays = Math.min(
      Math.max(1, parseInt(process.env.SECTION_SNAPSHOT_DAYS || '1', 10)),
      30
    );
    const snapshotMonthEnds = Math.min(
      Math.max(0, parseInt(process.env.SECTION_SNAPSHOT_MONTH_ENDS || '3', 10)),
      24
    );
    const isParallel = process.env.SECTION_CRON_PARALLEL === '1';

    // KST 기준 어제 날짜
    const yesterday = getYesterday();

    // 생성할 날짜 목록 (어제부터 N일 전까지)
    const targetDates = buildSnapshotTargetDates(yesterday, snapshotDays, snapshotMonthEnds);

    // Region/Brand 조합
    const regions = ['HKMC', 'TW'];
    const brands = ['M', 'X'];

    // Resources
    const resources = [
      { name: 'monthly-trend', fetch: fetchSection1MonthlyTrend },
      { name: 'store-sales', fetch: fetchSection1StoreSales },
    ];

    // TTL 설정: 72시간 (스냅샷용)
    const ttlSeconds = SNAPSHOT_TTL_SECONDS;

    // 실행 시작 로그
    console.log('[section1-cron] 🔄 Snapshot generation START', {
      dates: targetDates,
      regions,
      brands,
      resources: resources.map((r) => r.name),
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
      resource: string;
    }> = [];
    const errors: Array<{
      region: string;
      brand: string;
      date: string;
      resource: string;
      error: string;
    }> = [];

    // 스냅샷 생성 함수
    const generateSnapshot = async (
      region: string,
      brand: string,
      date: string,
      resource: { name: string; fetch: Function }
    ) => {
      try {
        console.log(
          `  📊 [section1-cron] Processing ${region}:${brand}:${date}:${resource.name}...`
        );

        // Snowflake 쿼리 실행
        const payload = await resource.fetch({ region, brand, date });

        // Redis에 저장
        await setSnapshot('SECTION1', resource.name, region, brand, date, payload, ttlSeconds);

        // 압축된 크기 추정 (정확한 크기는 setSnapshot 내부에서 계산됨)
        const estimatedBytes = JSON.stringify(payload).length;

        saved.push({
          key: `SECTION1:${resource.name}:${region}:${brand}:${date}`,
          bytes: estimatedBytes,
          region,
          brand,
          date,
          resource: resource.name,
        });
        console.log(
          `    ✅ [section1-cron] Saved: SECTION1:${resource.name}:${region}:${brand}:${date}`
        );
      } catch (error: any) {
        console.error(
          `    ❌ [section1-cron] Error for ${region}:${brand}:${date}:${resource.name}:`,
          error.message
        );
        errors.push({
          region,
          brand,
          date,
          resource: resource.name,
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
            for (const resource of resources) {
              tasks.push(generateSnapshot(region, brand, date, resource));
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
            for (const resource of resources) {
              await generateSnapshot(region, brand, date, resource);
            }
          }
        }
      }
    }

    // 완료 통계
    const durationMs = Date.now() - startTime;
    const totalBytes = saved.reduce((sum, item) => sum + item.bytes, 0);
    const totalTargets = targetDates.length * regions.length * brands.length * resources.length;
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
      console.error('[section1-cron] ⚠️  Snapshot generation COMPLETED WITH ERRORS', {
        total_targets: totalTargets,
        success_count: successCount,
        error_count: errorCount,
        total_kb: result.stats.total_kb,
        duration_ms: durationMs,
        errors: errors.map((e) => `${e.region}:${e.brand}:${e.date}:${e.resource}`),
      });
    } else {
      console.log('[section1-cron] ✅ Snapshot generation SUCCESS', {
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

    console.error('[section1-cron] ❌ FATAL ERROR', {
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
