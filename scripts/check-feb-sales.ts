/**
 * 2월 15일과 2월 16일 매출 데이터 비교 스크립트
 * 
 * 실행: npx ts-node scripts/check-feb-sales.ts
 */

// 환경 변수 로드
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { executeSnowflakeQuery } from '../lib/snowflake';

async function checkFebSales() {
  console.log('🔍 2월 15일과 2월 16일 매출 데이터 비교 시작...\n');

  try {
    // 1. 2월 15일 ~ 16일 일별 합계 조회
    const dailyQuery = `
      SELECT 
        SALE_DT,
        COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count,
        COUNT(*) AS total_records,
        SUM(ACT_SALE_AMT) AS total_sales,
        SUM(TAG_SALE_AMT) AS total_tag_sales
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE SALE_DT IN ('2025-02-15', '2025-02-16')
        AND LOCAL_SHOP_CD IN (
          'M01','M02','M03','M05','M06','M07','M08','M09','M10',
          'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
          'MC1','MC2','MC3','MC4',
          'HE1','HE2',
          'X01','XE1',
          'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
          'T11','T12','T13','T14','T15','T16','T17','T18',
          'TU1','TU2','TU3',
          'TE1','TE2','TE3','TE4',
          'D01','D02','D03','D04','D05',
          'DE1','DE2'
        )
      GROUP BY SALE_DT
      ORDER BY SALE_DT
    `;

    console.log('📊 일별 합계 조회 중...');
    const dailyResults = await executeSnowflakeQuery(dailyQuery, []);
    
    console.log('\n=== 일별 합계 ===');
    dailyResults.forEach((row: any) => {
      console.log(`날짜: ${row.SALE_DT}`);
      console.log(`  매장 수: ${row.STORE_COUNT}`);
      console.log(`  레코드 수: ${row.TOTAL_RECORDS}`);
      console.log(`  총 매출: ${Number(row.TOTAL_SALES).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`);
      console.log(`  총 정가: ${Number(row.TOTAL_TAG_SALES).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`);
      console.log('');
    });

    // 2. MTD 비교 (2월 1일 ~ 15일 vs 2월 1일 ~ 16일) - 쿼리 수정
    const mtd15Query = `
      SELECT 
        '2025-02-01 to 2025-02-15' AS period,
        COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count,
        SUM(ACT_SALE_AMT) AS total_sales
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE SALE_DT BETWEEN '2025-02-01' AND '2025-02-15'
        AND LOCAL_SHOP_CD IN (
          'M01','M02','M03','M05','M06','M07','M08','M09','M10',
          'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
          'MC1','MC2','MC3','MC4',
          'HE1','HE2',
          'X01','XE1',
          'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
          'T11','T12','T13','T14','T15','T16','T17','T18',
          'TU1','TU2','TU3',
          'TE1','TE2','TE3','TE4',
          'D01','D02','D03','D04','D05',
          'DE1','DE2'
        )
    `;
    
    const mtd16Query = `
      SELECT 
        '2025-02-01 to 2025-02-16' AS period,
        COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count,
        SUM(ACT_SALE_AMT) AS total_sales
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE SALE_DT BETWEEN '2025-02-01' AND '2025-02-16'
        AND LOCAL_SHOP_CD IN (
          'M01','M02','M03','M05','M06','M07','M08','M09','M10',
          'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
          'MC1','MC2','MC3','MC4',
          'HE1','HE2',
          'X01','XE1',
          'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
          'T11','T12','T13','T14','T15','T16','T17','T18',
          'TU1','TU2','TU3',
          'TE1','TE2','TE3','TE4',
          'D01','D02','D03','D04','D05',
          'DE1','DE2'
        )
    `;

    console.log('📊 MTD 비교 조회 중...');
    const mtd15Results = await executeSnowflakeQuery(mtd15Query, []);
    const mtd16Results = await executeSnowflakeQuery(mtd16Query, []);
    
    console.log('\n=== MTD 비교 ===');
    
    const feb15Sales = Number(mtd15Results[0].TOTAL_SALES);
    const feb16Sales = Number(mtd16Results[0].TOTAL_SALES);
    const difference = feb16Sales - feb15Sales;
    
    console.log(`기간: ${mtd15Results[0].PERIOD}`);
    console.log(`  총 매출: ${feb15Sales.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`);
    console.log('');
    
    console.log(`기간: ${mtd16Results[0].PERIOD}`);
    console.log(`  총 매출: ${feb16Sales.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`);
    console.log(`  차이 (2월 16일 매출): ${difference.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`);
    
    if (difference === 0) {
      console.log('  ⚠️  경고: 2월 16일 매출이 0원입니다!');
    } else if (difference < 0) {
      console.log('  🚨 심각: 2월 16일을 포함한 MTD가 2월 15일까지보다 작습니다!');
    }
    console.log('');

    // 3. 2월 16일 매장별 상세 데이터
    const storeDetailQuery = `
      SELECT 
        LOCAL_SHOP_CD,
        COUNT(*) AS record_count,
        SUM(ACT_SALE_AMT) AS total_sales,
        SUM(TAG_SALE_AMT) AS total_tag_sales
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE SALE_DT = '2025-02-16'
        AND LOCAL_SHOP_CD IN (
          'M01','M02','M03','M05','M06','M07','M08','M09','M10',
          'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
          'MC1','MC2','MC3','MC4',
          'HE1','HE2',
          'X01','XE1',
          'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
          'T11','T12','T13','T14','T15','T16','T17','T18',
          'TU1','TU2','TU3',
          'TE1','TE2','TE3','TE4',
          'D01','D02','D03','D04','D05',
          'DE1','DE2'
        )
      GROUP BY LOCAL_SHOP_CD
      ORDER BY LOCAL_SHOP_CD
    `;

    console.log('📊 2월 16일 매장별 상세 조회 중...');
    const storeDetails = await executeSnowflakeQuery(storeDetailQuery, []);
    
    console.log('\n=== 2월 16일 매장별 데이터 ===');
    if (storeDetails.length === 0) {
      console.log('⚠️  2월 16일 데이터가 없습니다!');
    } else {
      console.log(`총 ${storeDetails.length}개 매장의 데이터가 있습니다.`);
      
      // 매출이 0인 매장과 0이 아닌 매장 구분
      const zeroSales = storeDetails.filter((s: any) => Number(s.TOTAL_SALES) === 0);
      const nonZeroSales = storeDetails.filter((s: any) => Number(s.TOTAL_SALES) !== 0);
      
      console.log(`\n매출이 있는 매장: ${nonZeroSales.length}개`);
      if (nonZeroSales.length > 0) {
        nonZeroSales.slice(0, 5).forEach((row: any) => {
          console.log(`  ${row.LOCAL_SHOP_CD}: ${Number(row.TOTAL_SALES).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
        });
        if (nonZeroSales.length > 5) {
          console.log(`  ... 외 ${nonZeroSales.length - 5}개 매장`);
        }
      }
      
      console.log(`\n매출이 0인 매장: ${zeroSales.length}개`);
      if (zeroSales.length > 0 && zeroSales.length <= 10) {
        zeroSales.forEach((row: any) => {
          console.log(`  ${row.LOCAL_SHOP_CD}: ${row.RECORD_COUNT}건의 레코드 (매출 0원)`);
        });
      } else if (zeroSales.length > 10) {
        console.log(`  (너무 많아서 생략)`);
      }
    }

    // 4. 최근 데이터 확인
    const latestDateQuery = `
      SELECT 
        MAX(SALE_DT) AS latest_date,
        COUNT(DISTINCT SALE_DT) AS distinct_dates
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE SALE_DT >= '2025-02-01'
        AND LOCAL_SHOP_CD IN (
          'M01','M02','M03','M05','M06','M07','M08','M09','M10',
          'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
          'MC1','MC2','MC3','MC4',
          'HE1','HE2',
          'X01','XE1',
          'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
          'T11','T12','T13','T14','T15','T16','T17','T18',
          'TU1','TU2','TU3',
          'TE1','TE2','TE3','TE4',
          'D01','D02','D03','D04','D05',
          'DE1','DE2'
        )
    `;

    console.log('\n📊 최신 데이터 날짜 확인 중...');
    const latestDateResults = await executeSnowflakeQuery(latestDateQuery, []);
    
    console.log('\n=== 최신 데이터 ===');
    console.log(`최신 날짜: ${latestDateResults[0].LATEST_DATE}`);
    console.log(`2월 중 데이터가 있는 날짜 수: ${latestDateResults[0].DISTINCT_DATES}일`);

    console.log('\n✅ 데이터 검증 완료');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  }
}

// 실행
checkFebSales()
  .then(() => {
    console.log('\n프로그램 종료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('프로그램 실행 중 오류:', error);
    process.exit(1);
  });
