/**
 * API 직접 호출하여 2월 15일과 16일 데이터 비교
 * 
 * 실행: npx ts-node scripts/test-api-dates.ts
 */

// 환경 변수 로드
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { fetchSection1StoreSales } from '../lib/section1/store-sales';

async function testApiDates() {
  console.log('🔍 API를 통한 2월 15일과 16일 데이터 비교 시작...\n');

  try {
    const testCases = [
      { region: 'HKMC', brand: 'M', date: '2025-02-15' },
      { region: 'HKMC', brand: 'M', date: '2025-02-16' },
      { region: 'TW', brand: 'M', date: '2025-02-15' },
      { region: 'TW', brand: 'M', date: '2025-02-16' },
    ];

    for (const testCase of testCases) {
      console.log(`\n📊 조회: ${testCase.region} / ${testCase.brand} / ${testCase.date}`);
      console.log('='.repeat(60));
      
      const startTime = Date.now();
      const result = await fetchSection1StoreSales(testCase);
      const elapsed = Date.now() - startTime;
      
      console.log(`⏱️  조회 시간: ${elapsed}ms`);
      console.log(`\n총 매출 (MTD):`);
      
      if (result.total_subtotal) {
        console.log(`  MTD 실적: ${result.total_subtotal.mtd_act?.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) || 0}원`);
        console.log(`  MTD 목표: ${result.total_subtotal.target_mth?.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) || 0}원`);
        console.log(`  달성률: ${result.total_subtotal.progress?.toFixed(2) || 0}%`);
        console.log(`  YoY: ${result.total_subtotal.yoy?.toFixed(2) || 0}%`);
        console.log(`  MoM: ${result.total_subtotal.mom?.toFixed(2) || 0}%`);
        
        console.log(`\nYTD:`);
        console.log(`  YTD 실적: ${result.total_subtotal.ytd_act?.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) || 0}원`);
        console.log(`  YTD 목표: ${result.total_subtotal.ytd_target?.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) || 0}원`);
        console.log(`  달성률: ${result.total_subtotal.progress_ytd?.toFixed(2) || 0}%`);
      } else {
        console.log('  데이터 없음');
      }
      
      // 매장 데이터 샘플
      if (testCase.region === 'HKMC') {
        const hkStores = [...(result.hk_normal || []), ...(result.hk_outlet || []), ...(result.hk_online || [])];
        console.log(`\nHK 매장 수: ${hkStores.length}개`);
        if (hkStores.length > 0) {
          console.log(`  첫 번째 매장: ${hkStores[0].shop_name} - ${hkStores[0].mtd_act?.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
        }
        
        const mcStores = [...(result.mc_normal || []), ...(result.mc_outlet || []), ...(result.mc_online || [])];
        console.log(`MC 매장 수: ${mcStores.length}개`);
        if (mcStores.length > 0) {
          console.log(`  첫 번째 매장: ${mcStores[0].shop_name} - ${mcStores[0].mtd_act?.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
        }
      } else {
        const twStores = [...(result.tw_normal || []), ...(result.tw_outlet || []), ...(result.tw_online || [])];
        console.log(`\nTW 매장 수: ${twStores.length}개`);
        if (twStores.length > 0) {
          console.log(`  첫 번째 매장: ${twStores[0].shop_name} - ${twStores[0].mtd_act?.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
        }
      }
    }

    console.log('\n\n=== 분석 결과 ===');
    console.log('2월 15일과 2월 16일 데이터를 비교해보세요.');
    console.log('만약 MTD 실적이 동일하다면, Snowflake 데이터에 문제가 있는 것입니다.');
    console.log('만약 MTD 실적이 다르다면, 캐시나 대시보드 표시 로직에 문제가 있는 것입니다.');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  }
}

// 실행
testApiDates()
  .then(() => {
    console.log('\n✅ API 테스트 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('프로그램 실행 중 오류:', error);
    process.exit(1);
  });
