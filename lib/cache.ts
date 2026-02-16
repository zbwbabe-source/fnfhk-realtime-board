import { Redis } from '@upstash/redis';

// Singleton Redis client
let redisClient: Redis | null = null;

/**
 * Get or create Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    // Support both Upstash-native and Vercel KV env names.
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Redis credentials not configured. Set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN or KV_REST_API_URL/KV_REST_API_TOKEN'
      );
    }

    redisClient = new Redis({
      url,
      token,
    });
  }

  return redisClient;
}

// Key prefix for all cache keys
const KEY_PREFIX = 'fnfhk';

/**
 * Build a normalized cache key
 * 
 * @param parts - Array of key parts (e.g., ['section1', 'store-sales', region, brand, date])
 * @returns Normalized key string (e.g., 'fnfhk:section1:store-sales:HKMC:M:2025-01-15')
 * 
 * Normalization rules:
 * - Trims whitespace
 * - Uppercases region and brand
 * - Keeps date in YYYY-MM-DD format
 * - Validates date format
 */
export function buildKey(parts: string[]): string {
  const normalized = parts.map((part, index) => {
    const trimmed = part.trim();
    
    // Date validation (assume last part is date if it looks like YYYY-MM-DD)
    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Validate date format
      const dateObj = new Date(trimmed);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date format: ${trimmed}. Expected YYYY-MM-DD`);
      }
      return trimmed; // Keep date as-is
    }
    
    // Uppercase for region/brand (short strings like 'HKMC', 'M', 'X')
    return trimmed.toUpperCase();
  });

  return `${KEY_PREFIX}:${normalized.join(':')}`;
}

/**
 * Get value from Redis cache
 * 
 * @param key - Cache key (without prefix)
 * @returns Cached value or null if not found/expired
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const value = await redis.get<T>(key);
    return value;
  } catch (error) {
    console.error(`[Cache] Error getting key ${key}:`, error);
    return null;
  }
}

/**
 * Set value in Redis cache with TTL
 * 
 * @param key - Cache key (without prefix)
 * @param value - Value to cache
 * @param ttlSec - Time to live in seconds
 */
export async function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.setex(key, ttlSec, JSON.stringify(value));
    
    // Add key to cache index for invalidation
    // Extract region and brand from key (format: fnfhk:section:subsection:REGION:BRAND:...)
    const keyParts = key.split(':');
    if (keyParts.length >= 4) {
      const region = keyParts[3]; // e.g., 'HKMC' or 'TW'
      const brand = keyParts[4];  // e.g., 'M' or 'X' (may be undefined for latest-date)
      
      if (region) {
        const indexKey = brand 
          ? `${KEY_PREFIX}:cache-index:${region}:${brand}`
          : `${KEY_PREFIX}:cache-index:${region}`;
        
        // Add to set with same TTL (add extra buffer for safety)
        await redis.sadd(indexKey, key);
        await redis.expire(indexKey, ttlSec + 3600); // +1 hour buffer
      }
    }
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
    // Don't throw - allow API to continue even if cache fails
  }
}

/**
 * Invalidate all cache keys for a specific region and brand
 * 
 * @param region - Region (e.g., 'HKMC', 'TW')
 * @param brand - Brand (e.g., 'M', 'X')
 * @returns Number of keys deleted
 */
export async function invalidateCacheByRegionBrand(region: string, brand: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const normalizedRegion = region.trim().toUpperCase();
    const normalizedBrand = brand.trim().toUpperCase();
    
    const indexKey = `${KEY_PREFIX}:cache-index:${normalizedRegion}:${normalizedBrand}`;
    
    // Get all keys from the index set
    const keys = await redis.smembers(indexKey);
    
    if (!keys || keys.length === 0) {
      console.log(`[Cache] No keys found in index for ${normalizedRegion}:${normalizedBrand}`);
      return 0;
    }
    
    console.log(`[Cache] Invalidating ${keys.length} keys for ${normalizedRegion}:${normalizedBrand}`);
    
    // Delete all keys
    let deletedCount = 0;
    for (const key of keys) {
      await redis.del(key);
      deletedCount++;
    }
    
    // Clear the index set
    await redis.del(indexKey);
    
    console.log(`[Cache] Invalidated ${deletedCount} keys for ${normalizedRegion}:${normalizedBrand}`);
    return deletedCount;
  } catch (error) {
    console.error(`[Cache] Error invalidating cache for ${region}:${brand}:`, error);
    return 0;
  }
}
