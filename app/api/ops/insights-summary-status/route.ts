import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LAST_RUN_KEY = 'fnfhk:OPS:cron:last_run:insights-summary';

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET() {
  try {
    const dateKey = getUtcDateKey();
    const hitKey = `fnfhk:OPS:metrics:insights-summary:hit:${dateKey}`;
    const missKey = `fnfhk:OPS:metrics:insights-summary:miss:${dateKey}`;
    const refreshKey = `fnfhk:OPS:metrics:insights-summary:refresh:${dateKey}`;

    const [lastRunRaw, hitRaw, missRaw, refreshRaw] = await Promise.all([
      redis.get<any>(LAST_RUN_KEY),
      redis.get<number | string>(hitKey),
      redis.get<number | string>(missKey),
      redis.get<number | string>(refreshKey),
    ]);

    const hit = toNumber(hitRaw);
    const miss = toNumber(missRaw);
    const refresh = toNumber(refreshRaw);
    const total = hit + miss + refresh;
    const hitRate = total > 0 ? Number(((hit / total) * 100).toFixed(1)) : 0;

    let recommendedAction = '정상: 캐시 상태 양호';
    if (!lastRunRaw) {
      recommendedAction = 'CRON last_run 정보 없음: 수동 실행 또는 스케줄 확인 필요';
    } else if (toNumber(lastRunRaw.error_count) > 0) {
      recommendedAction = 'CRON 오류 감지: Vercel 로그에서 실패 건 원인 확인 필요';
    } else if (total === 0) {
      recommendedAction = '오늘 트래픽 없음: 서비스 트래픽 유입 여부 확인';
    } else if (hitRate < 70) {
      recommendedAction = 'HIT 비율 낮음: CRON 실행/TTL/키 불일치 점검 필요';
    }

    return NextResponse.json({
      last_run: lastRunRaw || null,
      today: {
        date: dateKey,
        hit,
        miss,
        refresh,
      },
      hit_rate: hitRate,
      recommended_action: recommendedAction,
    });
  } catch (error: any) {
    console.error('[OPS] insights-summary-status failed', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch insights summary ops status' },
      { status: 500 }
    );
  }
}
