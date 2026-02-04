import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section1/monthly-trend
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * Response:
 * {
 *   asof_date: string,
 *   region: string,
 *   brand: string,
 *   rows: [{ month: 'YYYY-MM', sales_amt: number, yoy: number | null }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    // 날짜 파싱
    const asofDate = new Date(date);
    const year = asofDate.getFullYear();
    const month = asofDate.getMonth() + 1; // 1-12
    const day = asofDate.getDate();

    // 지난 12개월 시작 월 계산 (과거 11개월 + 당월)
    const startDate = new Date(year, month - 12, 1);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    console.log('📊 Monthly Trend Params:', {
      region,
      brand,
      asof_date: date,
      period: `${startYear}-${String(startMonth).padStart(2, '0')} ~ ${year}-${String(month).padStart(2, '0')}`,
    });

    // Brand 정규화
    const normalizedBrand = normalizeBrand(brand);

    // 채널별 매장 코드 분류
    const stores = getStoreMaster();
    const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
    
    const filteredStores = stores.filter(s => {
      if (!countries.includes(s.country)) return false;
      const storeBrand = normalizeBrand(s.brand);
      if (storeBrand !== normalizedBrand) return false;
      if (s.channel === 'Warehouse') return false; // warehouse 제외
      return true;
    });

    const hkNormalStores = filteredStores.filter(s => s.country === 'HK' && s.channel === 'Normal').map(s => s.store_code);
    const hkOutletStores = filteredStores.filter(s => s.country === 'HK' && s.channel === 'Outlet').map(s => s.store_code);
    const hkOnlineStores = filteredStores.filter(s => s.country === 'HK' && s.channel === 'Online').map(s => s.store_code);
    const mcAllStores = filteredStores.filter(s => s.country === 'MC').map(s => s.store_code); // MC 전체

    if (filteredStores.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        rows: [],
      });
    }

    const hkNormalStr = hkNormalStores.length > 0 ? hkNormalStores.map(s => `'${s}'`).join(',') : "NULL";
    const hkOutletStr = hkOutletStores.length > 0 ? hkOutletStores.map(s => `'${s}'`).join(',') : "NULL";
    const hkOnlineStr = hkOnlineStores.length > 0 ? hkOnlineStores.map(s => `'${s}'`).join(',') : "NULL";
    const mcAllStr = mcAllStores.length > 0 ? mcAllStores.map(s => `'${s}'`).join(',') : "NULL";

    // 전체 매장 코드 리스트 (중복 제거)
    const allStoresStr = filteredStores.map(s => `'${s.store_code}'`).join(',');

    // Snowflake SQL - 채널별 집계
    const query = `
      WITH
      -- 당년도 월별 채널별 실적 (지난 12개월)
      ty_monthly AS (
        SELECT
          TO_CHAR(SALE_DT, 'YYYY-MM') AS month,
          SUM(CASE WHEN LOCAL_SHOP_CD IN (${hkNormalStr}) AND ${hkNormalStr} <> 'NULL' THEN ACT_SALE_AMT ELSE 0 END) AS hk_normal,
          SUM(CASE WHEN LOCAL_SHOP_CD IN (${hkOutletStr}) AND ${hkOutletStr} <> 'NULL' THEN ACT_SALE_AMT ELSE 0 END) AS hk_outlet,
          SUM(CASE WHEN LOCAL_SHOP_CD IN (${hkOnlineStr}) AND ${hkOnlineStr} <> 'NULL' THEN ACT_SALE_AMT ELSE 0 END) AS hk_online,
          SUM(CASE WHEN LOCAL_SHOP_CD IN (${mcAllStr}) AND ${mcAllStr} <> 'NULL' THEN ACT_SALE_AMT ELSE 0 END) AS mc_total,
          SUM(ACT_SALE_AMT) AS total_sales
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND LOCAL_SHOP_CD IN (${allStoresStr})
          AND SALE_DT >= DATEADD(MONTH, -11, DATE_TRUNC('MONTH', ?::DATE))
          AND SALE_DT <= ?::DATE
        GROUP BY TO_CHAR(SALE_DT, 'YYYY-MM')
      ),
      -- 전년도 월별 실적 (동일 월 기준)
      ly_monthly AS (
        SELECT
          TO_CHAR(DATEADD(YEAR, 1, SALE_DT), 'YYYY-MM') AS month,
          SUM(ACT_SALE_AMT) AS total_sales_ly
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND LOCAL_SHOP_CD IN (${allStoresStr})
          AND SALE_DT >= DATEADD(YEAR, -1, DATEADD(MONTH, -11, DATE_TRUNC('MONTH', ?::DATE)))
          AND SALE_DT <= DATEADD(YEAR, -1, ?::DATE)
        GROUP BY TO_CHAR(DATEADD(YEAR, 1, SALE_DT), 'YYYY-MM')
      )
      SELECT
        ty.month,
        COALESCE(ty.hk_normal, 0) AS hk_normal,
        COALESCE(ty.hk_outlet, 0) AS hk_outlet,
        COALESCE(ty.hk_online, 0) AS hk_online,
        COALESCE(ty.mc_total, 0) AS mc_total,
        COALESCE(ty.total_sales, 0) AS total_sales,
        CASE
          WHEN ly.total_sales_ly > 0
          THEN (ty.total_sales / ly.total_sales_ly) * 100
          ELSE NULL
        END AS yoy
      FROM ty_monthly ty
      LEFT JOIN ly_monthly ly ON ty.month = ly.month
      ORDER BY ty.month ASC
    `;

    const rows = await executeSnowflakeQuery(query, [
      normalizedBrand, // TY
      date,
      date,
      normalizedBrand, // LY
      date,
      date,
    ]);

    // 결과 변환
    const result = rows.map((row: any) => ({
      month: row.MONTH,
      hk_normal: parseFloat(row.HK_NORMAL || 0),
      hk_outlet: parseFloat(row.HK_OUTLET || 0),
      hk_online: parseFloat(row.HK_ONLINE || 0),
      mc_total: parseFloat(row.MC_TOTAL || 0),
      total_sales: parseFloat(row.TOTAL_SALES || 0),
      yoy: row.YOY !== null ? parseFloat(row.YOY) : null,
    }));

    console.log('✅ Monthly Trend Result:', {
      rowCount: result.length,
      sample: result.slice(0, 3),
    });

    return NextResponse.json({
      asof_date: date,
      region,
      brand,
      rows: result,
    });

  } catch (error: any) {
    console.error('Error in /api/section1/monthly-trend:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly trend', message: error.message },
      { status: 500 }
    );
  }
}
