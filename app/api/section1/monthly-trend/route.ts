import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';
import { cacheGet, cacheSet, buildKey } from '@/lib/cache';

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
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Build cache key
    let cacheKey: string;
    try {
      cacheKey = buildKey(['section1', 'monthly-trend', region, brand, date]);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.log('🔑 Redis Key:', cacheKey);

    // ✅ Check cache first (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = await cacheGet<any>(cacheKey);
      if (cached) {
        const elapsed = Date.now() - startTime;
        console.log(`[CACHE HIT] section1/monthly-trend [${cacheKey}] - ${elapsed}ms`);
        return NextResponse.json(cached);
      }
    }
    
    console.log(`[CACHE ${forceRefresh ? 'REFRESH' : 'MISS'}] section1/monthly-trend [${cacheKey}], fetching from DB...`);

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

    const hkNormalStores = filteredStores.filter(s => s.country === 'HK' && s.channel === '정상').map(s => s.store_code);
    const hkOutletStores = filteredStores.filter(s => s.country === 'HK' && s.channel === '아울렛').map(s => s.store_code);
    const hkOnlineStores = filteredStores.filter(s => s.country === 'HK' && s.channel === '온라인').map(s => s.store_code);
    const mcAllStores = filteredStores.filter(s => s.country === 'MC').map(s => s.store_code); // MC 전체

    if (filteredStores.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        rows: [],
      });
    }

    const hkNormalStr = hkNormalStores.map(s => `'${s}'`).join(',');
    const hkOutletStr = hkOutletStores.map(s => `'${s}'`).join(',');
    const hkOnlineStr = hkOnlineStores.map(s => `'${s}'`).join(',');
    const mcAllStr = mcAllStores.map(s => `'${s}'`).join(',');

    // 전체 매장 코드 리스트 (중복 제거)
    const allStoresStr = filteredStores.map(s => `'${s.store_code}'`).join(',');

    console.log('📊 Channel breakdown:', {
      hk_normal: hkNormalStores.length,
      hk_normal_codes: hkNormalStores.slice(0, 3),
      hk_outlet: hkOutletStores.length,
      hk_outlet_codes: hkOutletStores.slice(0, 3),
      hk_online: hkOnlineStores.length,
      hk_online_codes: hkOnlineStores.slice(0, 3),
      mc_total: mcAllStores.length,
      mc_codes: mcAllStores.slice(0, 3),
      total: filteredStores.length,
    });

    // Snowflake SQL - 채널별 집계
    const query = `
      WITH
      -- 당년도 월별 채널별 실적 (지난 12개월)
      ty_monthly AS (
        SELECT
          TO_CHAR(SALE_DT, 'YYYY-MM') AS month,
          ${hkNormalStr ? `SUM(CASE WHEN LOCAL_SHOP_CD IN (${hkNormalStr}) THEN ACT_SALE_AMT ELSE 0 END)` : '0'} AS hk_normal,
          ${hkOutletStr ? `SUM(CASE WHEN LOCAL_SHOP_CD IN (${hkOutletStr}) THEN ACT_SALE_AMT ELSE 0 END)` : '0'} AS hk_outlet,
          ${hkOnlineStr ? `SUM(CASE WHEN LOCAL_SHOP_CD IN (${hkOnlineStr}) THEN ACT_SALE_AMT ELSE 0 END)` : '0'} AS hk_online,
          ${mcAllStr ? `SUM(CASE WHEN LOCAL_SHOP_CD IN (${mcAllStr}) THEN ACT_SALE_AMT ELSE 0 END)` : '0'} AS mc_total,
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

    console.log('[DB EXEC] section1/monthly-trend', cacheKey);
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
      sample: result.slice(0, 2).map(r => ({
        month: r.month,
        hk_normal: r.hk_normal,
        hk_outlet: r.hk_outlet,
        hk_online: r.hk_online,
        mc_total: r.mc_total,
        total: r.total_sales,
      })),
    });

    const response = {
      asof_date: date,
      region,
      brand,
      rows: result,
    };

    // ✅ Cache the response for 10 minutes (600 seconds)
    const elapsed = Date.now() - startTime;
    await cacheSet(cacheKey, response, 600);
    console.log(`[CACHE SET] section1/monthly-trend [${cacheKey}] - Query executed in ${elapsed}ms`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error in /api/section1/monthly-trend:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly trend', message: error.message },
      { status: 500 }
    );
  }
}
