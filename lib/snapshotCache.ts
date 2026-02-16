import { redis } from './redis';
import { buildKey } from './cache';
import { compressToB64, decompressFromB64 } from './redisSnapshot';

/**
 * TTL 상수
 */
export const SNAPSHOT_TTL_SECONDS = 60 * 60 * 72; // 72시간 (Cron 생성 스냅샷용)
export const FALLBACK_TTL_SECONDS = 60 * 60 * 24; // 24시간 (Cache MISS fallback용)

/**
 * 스냅샷 메타데이터 타입
 */
export interface SnapshotMeta {
  section: 'SECTION1' | 'SECTION2' | 'SECTION3';
  resource: string;
  region: string;
  brand: string;
  date: string;
  generated_at: string;
}

/**
 * 스냅샷 데이터 구조
 */
export interface SnapshotData<T = any> {
  meta: SnapshotMeta;
  payload: T;
}

/**
 * 스냅샷 키 생성
 * 
 * 키 포맷: fnfhk:{SECTION}:{resource}:{REGION}:{BRAND}:{YYYY-MM-DD}
 * 
 * @example
 * buildSnapshotKey('SECTION1', 'monthly-trend', 'HKMC', 'M', '2026-02-14')
 * // => 'fnfhk:SECTION1:monthly-trend:HKMC:M:2026-02-14'
 */
export function buildSnapshotKey(
  section: 'SECTION1' | 'SECTION2' | 'SECTION3',
  resource: string,
  region: string,
  brand: string,
  date: string
): string {
  return buildKey([section, resource, region, brand, date]);
}

/**
 * Redis에서 스냅샷 조회
 * 
 * @returns 스냅샷이 존재하면 { meta, payload, compressedBytes } 반환, 없으면 null
 */
export async function getSnapshot<T = any>(
  section: 'SECTION1' | 'SECTION2' | 'SECTION3',
  resource: string,
  region: string,
  brand: string,
  date: string
): Promise<{ meta: SnapshotMeta; payload: T; compressedBytes: number } | null> {
  const key = buildSnapshotKey(section, resource, region, brand, date);

  try {
    const compressed = await redis.get<string>(key);

    if (!compressed) {
      return null;
    }

    // 압축 해제
    const snapshot = await decompressFromB64<SnapshotData<T>>(compressed);

    return {
      meta: snapshot.meta,
      payload: snapshot.payload,
      compressedBytes: compressed.length,
    };
  } catch (error: any) {
    console.error(`[snapshotCache] ❌ getSnapshot failed for key ${key}:`, error.message);
    return null;
  }
}

/**
 * Redis에 스냅샷 저장
 * 
 * @param ttlSeconds TTL (초 단위), 기본값: FALLBACK_TTL_SECONDS
 */
export async function setSnapshot<T = any>(
  section: 'SECTION1' | 'SECTION2' | 'SECTION3',
  resource: string,
  region: string,
  brand: string,
  date: string,
  payload: T,
  ttlSeconds: number = FALLBACK_TTL_SECONDS
): Promise<void> {
  const key = buildSnapshotKey(section, resource, region, brand, date);

  try {
    // 메타데이터 구성
    const meta: SnapshotMeta = {
      section,
      resource,
      region,
      brand,
      date,
      generated_at: new Date().toISOString(),
    };

    // 스냅샷 데이터 구성
    const snapshotData: SnapshotData<T> = {
      meta,
      payload,
    };

    // gzip 압축 + base64 인코딩
    const compressed = await compressToB64(snapshotData);

    // Redis 저장
    await redis.set(key, compressed, { ex: ttlSeconds });

    // 성공 로그 (민감정보 제외)
    console.log(`[snapshotCache] 💾 setSnapshot success`, {
      key,
      compressed_kb: (compressed.length / 1024).toFixed(2),
      ttl_seconds: ttlSeconds,
    });
  } catch (error: any) {
    console.error(`[snapshotCache] ❌ setSnapshot failed for key ${key}:`, error.message);
    throw error;
  }
}
