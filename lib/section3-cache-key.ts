import { buildKey } from '@/lib/cache';

export const SECTION3_CACHE_SCHEMA_VERSION = 'v2';

export function buildSection3OldSeasonCacheKey(
  region: string,
  brand: string,
  date: string,
  categoryFilter: 'clothes' | 'all'
): string {
  return buildKey([
    'section3',
    'old-season-inventory',
    SECTION3_CACHE_SCHEMA_VERSION,
    region,
    brand,
    date,
    categoryFilter,
  ]);
}

