import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { cacheGet, cacheSet, buildKey } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/latest-date
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X' (optional)
 * 
 * Returns the latest available date in the database for the given region
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand');
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    console.log('🔍 API Latest Date - Received params:', { region, brand, forceRefresh });

    // Build cache key (brand may be null)
    const cacheKeyParts = ['latest-date', region];
    if (brand) {
      cacheKeyParts.push(brand);
    }
    const cacheKey = buildKey(cacheKeyParts);

    console.log('🔑 Redis Key:', cacheKey);

    // ✅ Check cache first (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = await cacheGet<any>(cacheKey);
      if (cached) {
        const elapsed = Date.now() - startTime;
        console.log(`[CACHE HIT] latest-date [${cacheKey}] - ${elapsed}ms`);
        return NextResponse.json(cached);
      }
    }
    
    console.log(`[CACHE ${forceRefresh ? 'REFRESH' : 'MISS'}] latest-date [${cacheKey}], fetching from DB...`);

    // 리전별 국가 필터
    const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
    const countryFilter = countries.map(c => `'${c}'`).join(',');

    // 브랜드 필터 (옵션)
    const brandFilter = brand 
      ? `AND (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = '${brand}'`
      : '';

    // TW 매장 코드
    const twStores = [
      'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
      'T11','T12','T13','T14','T15','T16','T17','T18',
      'TU1','TU2','TU3',
      'TE1','TE2','TE3','TE4',
      'D01','D02','D03','D04','D05',
      'DE1','DE2'
    ];

    // HKMC 매장 코드
    const hkmcStores = [
      'M01','M02','M03','M05','M06','M07','M08','M09','M10',
      'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
      'MC1','MC2','MC3','MC4',
      'HE1','HE2',
      'X01','XE1'
    ];

    const storeList = region === 'TW' ? twStores : hkmcStores;
    const storeFilter = storeList.map(s => `'${s}'`).join(',');

    const query = `
      SELECT MAX(SALE_DT) as latest_date
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE LOCAL_SHOP_CD IN (${storeFilter})
        ${brandFilter}
        AND SALE_DT >= DATEADD(MONTH, -3, CURRENT_DATE())
    `;

    console.log('[DB EXEC] latest-date', cacheKey);
    const rows = await executeSnowflakeQuery(query, []);

    const latestDate = rows[0]?.LATEST_DATE;

    if (!latestDate) {
      return NextResponse.json({
        region,
        brand,
        latest_date: null,
        error: 'No data found',
      }, { status: 404 });
    }

    console.log(`✅ Latest date for ${region}: ${latestDate}`);

    const response = {
      region,
      brand,
      latest_date: latestDate,
    };

    // ✅ Cache the response for 1 minute (60 seconds)
    const elapsed = Date.now() - startTime;
    await cacheSet(cacheKey, response, 60);
    console.log(`[CACHE SET] latest-date [${cacheKey}] - Query executed in ${elapsed}ms`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error in /api/latest-date:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest date', message: error.message },
      { status: 500 }
    );
  }
}
