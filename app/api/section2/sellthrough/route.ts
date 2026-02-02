import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getAllStoresByRegionBrand, getStoresByRegionBrandChannel, normalizeBrand } from '@/lib/store-utils';
import { getSeasonCode, getSection2StartDate, formatDateYYYYMMDD } from '@/lib/date-utils';

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
    
    // 섹션2 계산 시작일: 시즌 시작일 - 6개월
    const startDate = getSection2StartDate(asofDate);
    const startDateStr = formatDateYYYYMMDD(startDate);

    console.log('📅 Date & Season Calculation:', {
      current: { date, sesn, startDate: startDateStr },
    });

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
        all_products: [],
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
      startDate: startDateStr,
      periodInfo: `${startDateStr} ~ ${date}`,
      allStoresCount: allStoreCodes.length,
      salesStoresCount: salesStoreCodes.length,
    });

    // =====================
    // 헤더용 SQL (TY만)
    // ⚠️ STOCK_DT가 없을 경우 가장 최근 데이터 사용
    // =====================
    const headerQuery = `
      WITH
      -- THIS YEAR (TY)
      sales_ty AS (
        SELECT SUM(TAG_SALE_AMT) AS sales_ty
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
          AND SALE_DT BETWEEN ? AND ?
      ),
      latest_stock_date_ty AS (
        SELECT MAX(STOCK_DT) AS stock_dt
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
          AND STOCK_DT <= DATEADD(DAY, 1, ?)
      ),
      stock_ty AS (
        SELECT SUM(s.TAG_STOCK_AMT) AS stock_ty, MAX(s.STOCK_DT) AS stock_dt_used
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
        CROSS JOIN latest_stock_date_ty l
        WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
          AND s.SESN = ?
          AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
          AND s.STOCK_DT = l.stock_dt
      )
      
      SELECT
        /* TY */
        COALESCE(s_ty.sales_ty, 0) AS sales_ty,
        COALESCE(st_ty.stock_ty, 0) AS stock_ty,
        st_ty.stock_dt_used AS stock_dt_ty,
        (COALESCE(s_ty.sales_ty, 0) + COALESCE(st_ty.stock_ty, 0)) AS inbound_ty,
        CASE
          WHEN (COALESCE(s_ty.sales_ty, 0) + COALESCE(st_ty.stock_ty, 0)) > 0
          THEN (COALESCE(s_ty.sales_ty, 0) / (COALESCE(s_ty.sales_ty, 0) + COALESCE(st_ty.stock_ty, 0))) * 100
          ELSE NULL
        END AS sellthrough_ty
      
      FROM sales_ty s_ty
      CROSS JOIN stock_ty st_ty
    `;

    const headerRows = await executeSnowflakeQuery(headerQuery, [
      // TY - sales_ty
      brand, sesn, startDateStr, date,
      // TY - latest_stock_date_ty
      brand, sesn, date,
      // TY - stock_ty
      brand, sesn
    ]);

    const headerData = headerRows[0] || {};
    const totalSales = parseFloat(headerData.SALES_TY || 0);
    const totalStock = parseFloat(headerData.STOCK_TY || 0);
    const totalInbound = parseFloat(headerData.INBOUND_TY || 0);
    const overall_sellthrough = headerData.SELLTHROUGH_TY !== null ? parseFloat(headerData.SELLTHROUGH_TY) : 0;

    console.log('📊 Header Calculation:', {
      params: {
        asof_date: date,
        sesn: sesn,
        start_date: startDateStr,
      },
      ty: { 
        sales: totalSales, 
        stock: totalStock, 
        stock_dt: headerData.STOCK_DT_TY,
        inbound: totalInbound, 
        sellthrough: overall_sellthrough 
      },
    });

    // ⚠️ 품번별 데이터 조회 (테이블용)
    // 헤더 YoY는 위의 headerQuery 결과 사용
    const productQuery = `
      WITH 
      latest_stock_date AS (
        SELECT MAX(STOCK_DT) AS stock_dt
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
          AND STOCK_DT <= DATEADD(DAY, 1, ?)
      ),
      ending_stock AS (
        SELECT 
          s.PRDT_CD, 
          ANY_VALUE(s.PART_CD) AS PART_CD, 
          SUM(s.TAG_STOCK_AMT) AS stock_tag,
          SUM(s.STOCK_QTY) AS stock_qty
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
        CROSS JOIN latest_stock_date l
        WHERE 
          (CASE WHEN s.BRD_CD IN ('M', 'I') THEN 'M' ELSE s.BRD_CD END) = ?
          AND s.SESN = ?
          AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
          AND s.STOCK_DT = l.stock_dt
        GROUP BY s.PRDT_CD
      ),
      sales_agg AS (
        SELECT 
          PRDT_CD, 
          ANY_VALUE(PART_CD) AS PART_CD, 
          SUM(TAG_SALE_AMT) AS sales_tag,
          SUM(SALE_QTY) AS sales_qty
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE 
          (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
          AND SALE_DT BETWEEN ? AND ?
        GROUP BY PRDT_CD
      )
      SELECT
        COALESCE(s.PRDT_CD, e.PRDT_CD) AS prdt_cd,
        SUBSTR(COALESCE(e.PART_CD, s.PART_CD), 3, 2) AS category,
        COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0) AS inbound_tag,
        COALESCE(s.sales_tag, 0) AS sales_tag,
        COALESCE(e.stock_tag, 0) AS stock_tag,
        COALESCE(s.sales_qty, 0) + COALESCE(e.stock_qty, 0) AS inbound_qty,
        COALESCE(s.sales_qty, 0) AS sales_qty,
        COALESCE(e.stock_qty, 0) AS stock_qty,
        CASE
          WHEN (COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0)) > 0
          THEN (COALESCE(s.sales_tag, 0) / (COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0))) * 100
          ELSE 0
        END AS sellthrough_pct
      FROM sales_agg s
      FULL OUTER JOIN ending_stock e ON s.PRDT_CD = e.PRDT_CD
      WHERE COALESCE(s.PRDT_CD, e.PRDT_CD) IS NOT NULL
      ORDER BY sellthrough_pct DESC
    `;

    const rows = await executeSnowflakeQuery(productQuery, [
      brand, sesn, date,                // latest_stock_date
      brand, sesn,                      // ending_stock
      brand, sesn, startDateStr, date   // sales_agg
    ]);

    console.log('📊 Section2 Query Result:', {
      region,
      brand,
      date,
      sesn,
      startDate: startDateStr,
      stockDtUsed: `${date} + 1 day`,
      allStoresCount: allStoreCodes.length,
      salesStoresCount: salesStoreCodes.length,
      rowsCount: rows.length,
      sampleRows: rows.slice(0, 5).map((r: any) => ({
        prdt_cd: r.PRDT_CD,
        inbound: r.INBOUND_TAG,
        sales: r.SALES_TAG,
        stock: r.STOCK_TAG,
        sellthrough: r.SELLTHROUGH_PCT,
      })),
    });

    if (rows.length === 0) {
      return NextResponse.json({
        asof_date: date,
        stock_dt_used: formatDateYYYYMMDD(new Date(new Date(date).getTime() + 86400000)),
        region,
        brand,
        header: { 
          sesn, 
          overall_sellthrough: 0,
          total_inbound: 0,
          total_sales: 0,
          sellthrough_yoy_pp: null,
          sales_yoy_pct: null,
          inbound_yoy_pct: null,
        },
        top10: [],
        all_products: [],
        no_inbound: [],
      });
    }

    // sales_tag > 0 또는 stock_tag > 0 데이터만 필터
    const validRows = rows.filter((r: any) => 
      parseFloat(r.SALES_TAG || 0) > 0 || parseFloat(r.STOCK_TAG || 0) > 0
    );

    // stock_dt_used (실제 사용된 재고 날짜)
    const stockDtUsed = headerData.STOCK_DT_TY ? formatDateYYYYMMDD(new Date(headerData.STOCK_DT_TY)) : formatDateYYYYMMDD(new Date(new Date(date).getTime() + 86400000));

    // 전체 데이터 매핑
    const allProducts = validRows.map((r: any) => ({
      prdt_cd: r.PRDT_CD,
      category: r.CATEGORY,
      inbound_tag: parseFloat(r.INBOUND_TAG || 0),
      sales_tag: parseFloat(r.SALES_TAG || 0),
      inbound_qty: parseInt(r.INBOUND_QTY || 0),
      sales_qty: parseInt(r.SALES_QTY || 0),
      sellthrough: parseFloat(r.SELLTHROUGH_PCT || 0),
    }));

    // 🔍 판매수량 0인 제품 확인
    const zeroSalesQtyProducts = allProducts.filter(p => p.sales_qty === 0);
    console.log('📊 판매수량 0인 제품:', {
      count: zeroSalesQtyProducts.length,
      samples: zeroSalesQtyProducts.slice(0, 5).map(p => ({
        prdt_cd: p.prdt_cd,
        sales_qty: p.sales_qty,
        stock_qty: p.inbound_qty - p.sales_qty,
        sellthrough: p.sellthrough
      }))
    });

    // No Sales & No Stock (제외)
    const no_inbound: any[] = [];

    const response = {
      asof_date: date,
      stock_dt_used: stockDtUsed,
      region,
      brand,
      header: {
        sesn,
        overall_sellthrough: Math.round(overall_sellthrough * 100) / 100,
        total_inbound: totalInbound,
        total_sales: totalSales,
      },
      all_products: allProducts,
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
