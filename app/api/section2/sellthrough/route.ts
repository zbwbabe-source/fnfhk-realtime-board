import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getAllStoresByRegionBrand, getStoresByRegionBrandChannel, normalizeBrand } from '@/lib/store-utils';
import { getSeasonCode } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section2/sellthrough
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * Response:
 * - header: { sesn, overall_sellthrough }
 * - top10: 판매율 TOP 10 (inbound > 0만)
 * - bad10: 판매율 BAD 10 (inbound > 0만)
 * - no_inbound: 입고 없는 품번 리스트 (inbound = 0, sales > 0)
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

    // 시즌 코드 계산
    const asofDate = new Date(date);
    const sesn = getSeasonCode(asofDate);

    // 매장 코드 준비
    // - all_store_codes: HKMC 전체 매장 (warehouse 포함) - inbound 계산용
    // - store_codes: warehouse 제외 매장 - sales 계산용
    const allStoreCodes = getAllStoresByRegionBrand(region, brand);
    const salesStoreCodes = getStoresByRegionBrandChannel(region, brand, true); // warehouse 제외

    if (allStoreCodes.length === 0 || salesStoreCodes.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        header: { sesn, overall_sellthrough: 0 },
        top10: [],
        bad10: [],
        no_inbound: [],
      });
    }

    const allStoreCodesStr = allStoreCodes.map(s => `'${s}'`).join(',');
    const salesStoreCodesStr = salesStoreCodes.map(s => `'${s}'`).join(',');

    console.log('📊 Section2 Params:', {
      region,
      brand,
      date,
      sesn,
      allStoresCount: allStoreCodes.length,
      salesStoresCount: salesStoreCodes.length,
    });

    // ⚠️ 중요: 이 방식은 매장 간 재고 이동(transfer)도 positive delta로 잡히므로
    // '외부/본사 입고'만이 아닌 '재고 유입 이벤트' 기준 inbound로 해석
    const query = `
      WITH inbound_calc AS (
        SELECT 
          LOCAL_SHOP_CD,
          PRDT_CD,
          PART_CD,
          TAG_STOCK_AMT,
          STOCK_DT,
          LAG(TAG_STOCK_AMT, 1, TAG_STOCK_AMT) 
            OVER (PARTITION BY LOCAL_SHOP_CD, PRDT_CD ORDER BY STOCK_DT) AS prev_stock,
          TAG_STOCK_AMT - LAG(TAG_STOCK_AMT, 1, TAG_STOCK_AMT) 
            OVER (PARTITION BY LOCAL_SHOP_CD, PRDT_CD ORDER BY STOCK_DT) AS delta
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE 
          (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
          AND STOCK_DT <= ?
      ),
      inbound AS (
        SELECT
          PRDT_CD,
          SUBSTR(PART_CD, 3, 2) AS category,
          SUM(GREATEST(delta, 0)) AS inbound_tag
        FROM inbound_calc
        GROUP BY PRDT_CD, SUBSTR(PART_CD, 3, 2)
      ),
      sales AS (
        SELECT
          PRDT_CD,
          SUM(TAG_SALE_AMT) AS sales_tag
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE 
          (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
          AND SALE_DT <= ?
        GROUP BY PRDT_CD
      )
      SELECT
        COALESCE(i.PRDT_CD, s.PRDT_CD) AS prdt_cd,
        i.category,
        COALESCE(i.inbound_tag, 0) AS inbound_tag,
        COALESCE(s.sales_tag, 0) AS sales_tag,
        CASE 
          WHEN COALESCE(i.inbound_tag, 0) > 0 
          THEN (COALESCE(s.sales_tag, 0) / i.inbound_tag) * 100
          ELSE 0
        END AS sellthrough
      FROM inbound i
      FULL OUTER JOIN sales s ON i.PRDT_CD = s.PRDT_CD
      ORDER BY sellthrough DESC
    `;

    const rows = await executeSnowflakeQuery(query, [
      brand, sesn, date,  // inbound_calc
      brand, sesn, date   // sales
    ]);

    console.log('📊 Section2 Query Result:', {
      region,
      brand,
      date,
      sesn,
      allStoresCount: allStoreCodes.length,
      salesStoresCount: salesStoreCodes.length,
      rowsCount: rows.length,
      sampleRow: rows[0],
    });

    if (rows.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        header: { sesn, overall_sellthrough: 0 },
        top10: [],
        bad10: [],
        no_inbound: [],
      });
    }

    // inbound > 0 데이터만 필터
    const validRows = rows.filter((r: any) => parseFloat(r.INBOUND_TAG || 0) > 0);

    // Overall sell-through 계산
    const totalInbound = validRows.reduce((sum: number, r: any) => sum + parseFloat(r.INBOUND_TAG || 0), 0);
    const totalSales = validRows.reduce((sum: number, r: any) => sum + parseFloat(r.SALES_TAG || 0), 0);
    const overall_sellthrough = totalInbound > 0 ? (totalSales / totalInbound) * 100 : 0;

    // TOP 10 (sellthrough 높은 순)
    const top10 = validRows
      .sort((a: any, b: any) => parseFloat(b.SELLTHROUGH || 0) - parseFloat(a.SELLTHROUGH || 0))
      .slice(0, 10)
      .map((r: any) => ({
        prdt_cd: r.PRDT_CD,
        category: r.CATEGORY,
        inbound_tag: parseFloat(r.INBOUND_TAG || 0),
        sales_tag: parseFloat(r.SALES_TAG || 0),
        sellthrough: parseFloat(r.SELLTHROUGH || 0) * 100, // 퍼센트로 변환
      }));

    // BAD 10 (sellthrough 낮은 순)
    const bad10 = validRows
      .sort((a: any, b: any) => parseFloat(a.SELLTHROUGH || 0) - parseFloat(b.SELLTHROUGH || 0))
      .slice(0, 10)
      .map((r: any) => ({
        prdt_cd: r.PRDT_CD,
        category: r.CATEGORY,
        inbound_tag: parseFloat(r.INBOUND_TAG || 0),
        sales_tag: parseFloat(r.SALES_TAG || 0),
        sellthrough: parseFloat(r.SELLTHROUGH || 0) * 100,
      }));

    // No Inbound (inbound = 0, sales > 0)
    const no_inbound = rows
      .filter((r: any) => parseFloat(r.INBOUND_TAG || 0) === 0 && parseFloat(r.SALES_TAG || 0) > 0)
      .slice(0, 10)
      .map((r: any) => ({
        prdt_cd: r.PRDT_CD,
        category: r.CATEGORY,
        sales_tag: parseFloat(r.SALES_TAG || 0),
      }));

    const response = {
      asof_date: date,
      region,
      brand,
      header: {
        sesn,
        overall_sellthrough: Math.round(overall_sellthrough * 100) / 100,
      },
      top10,
      bad10,
      no_inbound,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error in /api/section2/sellthrough:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sell-through data', message: error.message },
      { status: 500 }
    );
  }
}
