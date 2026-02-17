/**
 * 2월 15일과 16일 MTD 데이터 직접 비교
 * 
 * 실행: npx ts-node scripts/compare-mtd.ts
 */

// 환경 변수 로드
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { executeSnowflakeQuery } from '../lib/snowflake';

async function compareMTD() {
  console.log('🔍 2월 15일과 16일 MTD 비교 (Section1 쿼리 기준)\n');

  try {
    const dates = ['2025-02-15', '2025-02-16'];
    const regions = [
      { name: 'HKMC', stores: ['M01','M02','M03','M05','M06','M07','M08','M09','M10','M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22','MC1','MC2','MC3','MC4','HE1','HE2','X01','XE1'] },
      { name: 'TW', stores: ['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T11','T12','T13','T14','T15','T16','T17','T18','TU1','TU2','TU3','TE1','TE2','TE3','TE4','D01','D02','D03','D04','D05','DE1','DE2'] }
    ];
    const brands = ['M', 'X'];

    for (const region of regions) {
      for (const brand of brands) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`리전: ${region.name} | 브랜드: ${brand}`);
        console.log('='.repeat(70));

        const storeCodes = region.stores.map(s => `'${s}'`).join(',');

        for (const date of dates) {
          // Section1에서 사용하는 쿼리와 동일한 로직
          const query = `
            WITH store_sales AS (
              SELECT
                LOCAL_SHOP_CD AS shop_cd,
                
                /* MTD ACT */
                SUM(
                  CASE
                    WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
                    THEN ACT_SALE_AMT ELSE 0
                  END
                ) AS mtd_act,
                
                /* MTD ACT PY (전년 동월) */
                SUM(
                  CASE
                    WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
                    THEN ACT_SALE_AMT ELSE 0
                  END
                ) AS mtd_act_py,
                
                /* YTD ACT */
                SUM(
                  CASE
                    WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
                    THEN ACT_SALE_AMT ELSE 0
                  END
                ) AS ytd_act
                
              FROM SAP_FNF.DW_HMD_SALE_D
              WHERE
                (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
                AND LOCAL_SHOP_CD IN (${storeCodes})
                AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND TO_DATE(?)
              GROUP BY LOCAL_SHOP_CD
            )
            SELECT
              SUM(mtd_act) as total_mtd_act,
              SUM(mtd_act_py) as total_mtd_act_py,
              SUM(ytd_act) as total_ytd_act,
              CASE
                WHEN SUM(mtd_act_py) > 0
                THEN (SUM(mtd_act) / SUM(mtd_act_py)) * 100
                ELSE 0
              END AS yoy
            FROM store_sales
          `;

          const rows = await executeSnowflakeQuery(query, [
            date,
            date, // MTD ACT current
            date,
            date, // MTD ACT PY
            date,
            date, // YTD ACT current
            brand, // brand filter
            date,
            date, // date range filter
          ]);

          const result = rows[0];
          const mtdAct = Number(result.TOTAL_MTD_ACT || 0);
          const mtdActPy = Number(result.TOTAL_MTD_ACT_PY || 0);
          const ytdAct = Number(result.TOTAL_YTD_ACT || 0);
          const yoy = Number(result.YOY || 0);

          console.log(`\n날짜: ${date}`);
          console.log(`  MTD 실적: ${mtdAct.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
          console.log(`  MTD 전년: ${mtdActPy.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
          console.log(`  YoY: ${yoy.toFixed(2)}%`);
          console.log(`  YTD 실적: ${ytdAct.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`);
        }

        // 2월 15일과 16일 비교
        console.log(`\n📊 결론:`);
        console.log(`  위 두 날짜의 MTD 실적이 동일한가요?`);
        console.log(`  - 동일하면: Snowflake 데이터에 2월 16일 데이터가 없거나 잘못되었습니다.`);
        console.log(`  - 다르면: 데이터는 정상이며, 대시보드 캐시나 표시 문제입니다.`);
      }
    }

    console.log('\n\n✅ 비교 완료');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  }
}

// 실행
compareMTD()
  .then(() => {
    console.log('\n프로그램 종료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('프로그램 실행 중 오류:', error);
    process.exit(1);
  });
