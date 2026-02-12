import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeMerge } from '@/lib/snowflake';
import { getStoresByRegionBrandChannel, getWarehouseStores } from '@/lib/store-utils';
import { getYesterday, formatDateYYYYMMDD, getSeasonCode, getSection2StartDate } from '@/lib/date-utils';
import { getApparelCategories } from '@/lib/category-utils.server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Vercel Cron Job: Daily Aggregate
 * 
 * Schedule: 매일 05:00 KST
 * Protection: CRON_SECRET header
 * 
 * 작업 내용:
 * 1. 섹션1: 매장별 MTD 매출 집계 (HKMC)
 * 2. 섹션2: 당시즌 의류 판매율 집계 (HKMC)
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const results: any = {
    success: false,
    asof_date: '',
    section1: { status: 'pending', brands: {} },
    section2: { status: 'pending', brands: {} },
    errors: [],
  };

  try {
    // asof_date는 항상 어제
    const yesterday = getYesterday();
    const asofDate = formatDateYYYYMMDD(yesterday);
    results.asof_date = asofDate;

    console.log(`🔄 Starting daily aggregate for ${asofDate}...`);

    // HKMC 리전, 브랜드별 집계
    const region = 'HKMC';
    const brands = ['M', 'X'];

    // ========================================
    // 섹션1: 매장별 MTD 매출 집계
    // ========================================
    console.log('\n📊 Section 1: Store MTD Sales');
    
    for (const brand of brands) {
      try {
        const storeCodes = getStoresByRegionBrandChannel(region, brand, true);
        
        console.log(`  - Brand ${brand}: ${storeCodes.length} stores`);

        if (storeCodes.length === 0) {
          console.log(`    ⚠️ No stores found for ${region} ${brand}`);
          continue;
        }

        // SQL 파일 로드
        const sqlPath = path.join(process.cwd(), 'sql', 'merge_section1_store_sales.sql');
        let sqlTemplate = fs.readFileSync(sqlPath, 'utf-8');

        // 파라미터 바인딩 (Snowflake 바인딩은 배열 IN 지원 제한적이므로 문자열 치환)
        const storeCodesStr = storeCodes.map(c => `'${c}'`).join(',');
        const sql = sqlTemplate
          .replace(/:asof_date/g, `'${asofDate}'`)
          .replace(/:region/g, `'${region}'`)
          .replace(/:brand/g, `'${brand}'`)
          .replace(/IN \(:store_codes\)/g, `IN (${storeCodesStr})`);

        const result = await executeSnowflakeMerge(sql);
        
        results.section1.brands[brand] = {
          status: 'success',
          rowsAffected: result.rowsAffected,
          storeCount: storeCodes.length,
        };

        console.log(`    ✅ Merged ${result.rowsAffected} rows`);
      } catch (error: any) {
        console.error(`    ❌ Error for brand ${brand}:`, error.message);
        results.section1.brands[brand] = {
          status: 'error',
          error: error.message,
        };
        results.errors.push(`Section1 Brand ${brand}: ${error.message}`);
      }
    }

    results.section1.status = 'completed';

    // ========================================
    // 섹션2: 당시즌 의류 판매율 집계
    // ========================================
    console.log('\n📈 Section 2: Season Sell-through (Apparel Only)');
    
    const sesn = getSeasonCode(yesterday);
    console.log(`  Season: ${sesn}`);

    for (const brand of brands) {
      try {
        const warehouseCodes = getWarehouseStores(region, brand);
        const storeCodes = getStoresByRegionBrandChannel(region, brand, true);

        console.log(`  - Brand ${brand}: ${warehouseCodes.length} warehouses, ${storeCodes.length} stores`);

        if (warehouseCodes.length === 0 || storeCodes.length === 0) {
          console.log(`    ⚠️ Insufficient data for ${region} ${brand}`);
          continue;
        }

        // SQL 파일 로드
        const sqlPath = path.join(process.cwd(), 'sql', 'merge_section2_sellthrough.sql');
        let sqlTemplate = fs.readFileSync(sqlPath, 'utf-8');

        // start_date 계산 (섹션2 시작일: 시즌 시작일 - 6개월)
        const startDate = getSection2StartDate(yesterday);
        const startDateStr = formatDateYYYYMMDD(startDate);

        // 의류 카테고리 목록 가져오기
        const apparelCategories = getApparelCategories();
        const apparelCategoriesStr = apparelCategories.map(c => `'${c}'`).join(',');

        // 파라미터 바인딩
        const warehouseCodesStr = warehouseCodes.map(c => `'${c}'`).join(',');
        const storeCodesStr = storeCodes.map(c => `'${c}'`).join(',');
        const sql = sqlTemplate
          .replace(/:asof_date/g, `'${asofDate}'`)
          .replace(/:start_date/g, `'${startDateStr}'`)
          .replace(/:region/g, `'${region}'`)
          .replace(/:brand/g, `'${brand}'`)
          .replace(/:sesn/g, `'${sesn}'`)
          .replace(/IN \(:all_store_codes\)/g, `IN (${warehouseCodesStr})`)
          .replace(/IN \(:store_codes\)/g, `IN (${storeCodesStr})`)
          .replace(/IN \(:apparel_categories\)/g, `IN (${apparelCategoriesStr})`);

        const result = await executeSnowflakeMerge(sql);
        
        results.section2.brands[brand] = {
          status: 'success',
          rowsAffected: result.rowsAffected,
          warehouseCount: warehouseCodes.length,
          storeCount: storeCodes.length,
        };

        console.log(`    ✅ Merged ${result.rowsAffected} rows`);
      } catch (error: any) {
        console.error(`    ❌ Error for brand ${brand}:`, error.message);
        results.section2.brands[brand] = {
          status: 'error',
          error: error.message,
        };
        results.errors.push(`Section2 Brand ${brand}: ${error.message}`);
      }
    }

    results.section2.status = 'completed';

    // ========================================
    // 완료
    // ========================================
    const duration = Date.now() - startTime;
    results.success = results.errors.length === 0;
    results.duration_ms = duration;

    console.log(`\n✅ Daily aggregate completed in ${duration}ms`);
    console.log(`   Errors: ${results.errors.length}`);

    return NextResponse.json(results, { status: results.success ? 200 : 207 });

  } catch (error: any) {
    console.error('❌ Fatal error in daily aggregate:', error);
    results.errors.push(`Fatal: ${error.message}`);
    
    return NextResponse.json(
      { ...results, success: false, error: error.message },
      { status: 500 }
    );
  }
}
