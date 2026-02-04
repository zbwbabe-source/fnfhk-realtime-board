import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getAllStoresByRegionBrand, normalizeBrand } from '@/lib/store-utils';

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

    // 지난 6개월 시작 월 계산 (과거 5개월 + 당월)
    const startDate = new Date(year, month - 6, 1);
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

    // 매장 코드 가져오기 (warehouse 제외)
    const storeCodes = getAllStoresByRegionBrand(region, brand).filter(code => {
      // warehouse는 제외 (보통 'W'로 시작)
      return !code.startsWith('W');
    });

    if (storeCodes.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        rows: [],
      });
    }

    const storeCodesStr = storeCodes.map(s => `'${s}'`).join(',');

    // Snowflake SQL
    const query = `
      WITH
      -- 당년도 월별 실적 (지난 6개월)
      ty_monthly AS (
        SELECT
          TO_CHAR(SALE_DT, 'YYYY-MM') AS month,
          SUM(TAG_SALE_AMT) AS sales_amt
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND LOCAL_SHOP_CD IN (${storeCodesStr})
          AND SALE_DT >= DATEADD(MONTH, -5, DATE_TRUNC('MONTH', ?::DATE))
          AND SALE_DT <= ?::DATE
        GROUP BY TO_CHAR(SALE_DT, 'YYYY-MM')
      ),
      -- 전년도 월별 실적 (동일 월 기준)
      ly_monthly AS (
        SELECT
          TO_CHAR(DATEADD(YEAR, 1, SALE_DT), 'YYYY-MM') AS month,
          SUM(TAG_SALE_AMT) AS sales_amt_ly
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND LOCAL_SHOP_CD IN (${storeCodesStr})
          AND SALE_DT >= DATEADD(YEAR, -1, DATEADD(MONTH, -5, DATE_TRUNC('MONTH', ?::DATE)))
          AND SALE_DT <= DATEADD(YEAR, -1, ?::DATE)
        GROUP BY TO_CHAR(DATEADD(YEAR, 1, SALE_DT), 'YYYY-MM')
      )
      SELECT
        ty.month,
        COALESCE(ty.sales_amt, 0) AS sales_amt,
        CASE
          WHEN ly.sales_amt_ly > 0
          THEN (ty.sales_amt / ly.sales_amt_ly) * 100
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
      sales_amt: parseFloat(row.SALES_AMT || 0),
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
