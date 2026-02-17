/**
 * Redis 캐시 확인 및 초기화 스크립트
 * 
 * 실행: npx ts-node scripts/check-redis-cache.ts
 */

// 환경 변수 로드
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { Redis } from '@upstash/redis';

async function checkRedisCache() {
  console.log('🔍 Redis 캐시 확인 시작...\n');

  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

  try {
    // 1. Section1 관련 키 조회
    console.log('📊 Section1 store-sales 캐시 키 조회 중...');
    
    // HKMC M 브랜드 2월 15일, 16일
    const keys = [
      'snapshot:SECTION1:store-sales:HKMC:M:2025-02-15',
      'snapshot:SECTION1:store-sales:HKMC:M:2025-02-16',
      'snapshot:SECTION1:store-sales:HKMC:X:2025-02-15',
      'snapshot:SECTION1:store-sales:HKMC:X:2025-02-16',
      'snapshot:SECTION1:store-sales:TW:M:2025-02-15',
      'snapshot:SECTION1:store-sales:TW:M:2025-02-16',
      'snapshot:SECTION1:store-sales:TW:X:2025-02-15',
      'snapshot:SECTION1:store-sales:TW:X:2025-02-16',
    ];

    console.log('\n=== 캐시 키 존재 여부 ===');
    for (const key of keys) {
      const exists = await redis.exists(key);
      const ttl = exists ? await redis.ttl(key) : -2;
      
      console.log(`키: ${key}`);
      console.log(`  존재 여부: ${exists ? '✅ 있음' : '❌ 없음'}`);
      
      if (exists) {
        console.log(`  TTL: ${ttl}초 (${Math.floor(ttl / 3600)}시간 ${Math.floor((ttl % 3600) / 60)}분)`);
        
        // 데이터 미리보기
        const data: any = await redis.get(key);
        if (data && data.payload) {
          const mtdAct = data.payload.total_subtotal?.mtd_act || 0;
          const asofDate = data.payload.asof_date || 'N/A';
          console.log(`  as_of_date: ${asofDate}`);
          console.log(`  MTD 매출: ${mtdAct.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
          console.log(`  생성 시각: ${data.meta?.generated_at || 'N/A'}`);
        }
      }
      console.log('');
    }

    // 2. latest-date 캐시 확인
    console.log('\n=== latest-date 캐시 확인 ===');
    const latestDateKeys = [
      'latest-date:HKMC',
      'latest-date:HKMC:M',
      'latest-date:HKMC:X',
      'latest-date:TW',
      'latest-date:TW:M',
      'latest-date:TW:X',
    ];

    for (const key of latestDateKeys) {
      const exists = await redis.exists(key);
      if (exists) {
        const data: any = await redis.get(key);
        console.log(`키: ${key}`);
        console.log(`  최신 날짜: ${data?.latest_date || 'N/A'}`);
        const ttl = await redis.ttl(key);
        console.log(`  TTL: ${ttl}초`);
        console.log('');
      }
    }

    // 3. 캐시 초기화 옵션
    console.log('\n💡 캐시를 초기화하려면 다음 명령을 실행하세요:');
    console.log('   npx ts-node scripts/clear-redis-cache.ts\n');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  }
}

// 실행
checkRedisCache()
  .then(() => {
    console.log('✅ 캐시 확인 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('프로그램 실행 중 오류:', error);
    process.exit(1);
  });
