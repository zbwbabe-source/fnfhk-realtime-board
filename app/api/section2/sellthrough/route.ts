import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand, getWarehouseStores } from '@/lib/store-utils';
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

    // Store master 로드
    const storeMaster = getStoreMaster();
    const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
    
    // Section 2용 매장: Warehouse 제외 (판매 매장)
    const salesStores = storeMaster.filter(s => 
      countries.includes(s.country) && 
      normalizeBrand(s.brand) === brand &&
      s.channel !== 'Warehouse'
    );

    // Warehouse 매장 (입고 기준)
    const warehouseStores = getWarehouseStores(region, brand);

    if (salesStores.length === 0 || warehouseStores.length === 0) {
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

    const salesStoreCodes = salesStores.map(s => `'${s.store_code}'`).join(',');
    const warehouseCodes = warehouseStores.map(w => `'${w}'`).join(',');

    // DW_HMD_SALE_D, DW_HMD_STOCK_SNAP_D에서 직접 집계
    const query = `
      WITH inbound AS (
        SELECT
          PRDT_CD,
          SUBSTR(PART_CD, 3, 2) AS category,
          SUM(TAG_STOCK_AMT) AS inbound_tag
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE STOCK_DT = ?
          AND LOCAL_SHOP_CD IN (${warehouseCodes})
          AND BRD_CD IN ('M', 'I', 'X')
          AND SESN = ?
        GROUP BY PRDT_CD, SUBSTR(PART_CD, 3, 2)
      ),
      sales AS (
        SELECT
          PRDT_CD,
          SUM(TAG_SALE_AMT) AS sales_tag
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE LOCAL_SHOP_CD IN (${salesStoreCodes})
          AND BRD_CD IN ('M', 'I', 'X')
          AND SESN = ?
        GROUP BY PRDT_CD
      )
      SELECT
        COALESCE(i.PRDT_CD, s.PRDT_CD) AS prdt_cd,
        i.category,
        COALESCE(i.inbound_tag, 0) AS inbound_tag,
        COALESCE(s.sales_tag, 0) AS sales_tag,
        CASE 
          WHEN COALESCE(i.inbound_tag, 0) > 0 
          THEN COALESCE(s.sales_tag, 0) / i.inbound_tag
          ELSE 0
        END AS sellthrough
      FROM inbound i
      FULL OUTER JOIN sales s ON i.PRDT_CD = s.PRDT_CD
      ORDER BY sellthrough DESC
    `;

    const rows = await executeSnowflakeQuery(query, [date, sesn, sesn]);

    console.log('📊 Section2 Query Result:', {
      region,
      brand,
      date,
      sesn,
      salesStoresCount: salesStores.length,
      warehouseStoresCount: warehouseStores.length,
      warehouseCodes,
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
