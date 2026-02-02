import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getAllStoresByRegionBrand, getStoresByRegionBrandChannel, normalizeBrand } from '@/lib/store-utils';
import { getSeasonCode, getSection2StartDate, formatDateYYYYMMDD, getSeasonStartDate } from '@/lib/date-utils';
import { parseISO, subMonths } from 'date-fns';

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

    // =====================
    // 전년(LY) 계산: TY 시즌에서 연도만 -1
    // =====================
    const asofDateLY = new Date(asofDate);
    asofDateLY.setFullYear(asofDateLY.getFullYear() - 1);
    const dateLY = formatDateYYYYMMDD(asofDateLY);
    
    // LY 시즌: TY 시즌에서 연도만 -1 (예: 25F -> 24F, 26S -> 25S)
    // getSeasonCode(asof_date_ly) 사용 금지 (시즌 경계 오류 방지)
    const sesnYear = parseInt(sesn.substring(0, 2), 10);
    const sesnType = sesn.substring(2); // 'F' or 'S'
    const sesnLY = `${(sesnYear - 1).toString().padStart(2, '0')}${sesnType}`;
    
    // LY 시즌 시작일 - 6개월
    // LY 시즌 코드로부터 실제 날짜 역산
    const lySeasonYear = 2000 + sesnYear - 1; // 예: 24F -> 2024
    const lySeasonDate = new Date(lySeasonYear, sesnType === 'F' ? 8 : 2, 1); // F=9월, S=3월
    const seasonStartDateLY = getSeasonStartDate(lySeasonDate);
    const startDateLY = subMonths(seasonStartDateLY, 6);
    const startDateStrLY = formatDateYYYYMMDD(startDateLY);

    console.log('📅 Date & Season Calculation:', {
      current: { date, sesn, startDate: startDateStr },
      lastYear: { date: dateLY, sesn: sesnLY, startDate: startDateStrLY },
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
    // 헤더용 단일 SQL (TY / LY + YoY)
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
      ),
      
      -- LAST YEAR (LY)
      sales_ly AS (
        SELECT SUM(TAG_SALE_AMT) AS sales_ly
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
          AND SALE_DT BETWEEN ? AND ?
      ),
      latest_stock_date_ly AS (
        SELECT MAX(STOCK_DT) AS stock_dt
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND SESN = ?
          AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
          AND STOCK_DT <= DATEADD(DAY, 1, ?)
      ),
      stock_ly AS (
        SELECT SUM(s.TAG_STOCK_AMT) AS stock_ly, MAX(s.STOCK_DT) AS stock_dt_used
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
        CROSS JOIN latest_stock_date_ly l
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
        END AS sellthrough_ty,
      
        /* LY */
        COALESCE(s_ly.sales_ly, 0) AS sales_ly,
        COALESCE(st_ly.stock_ly, 0) AS stock_ly,
        st_ly.stock_dt_used AS stock_dt_ly,
        (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0)) AS inbound_ly,
        CASE
          WHEN (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0)) > 0
          THEN (COALESCE(s_ly.sales_ly, 0) / (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0))) * 100
          ELSE NULL
        END AS sellthrough_ly,
      
        /* YoY metrics */
        (
          CASE
            WHEN (COALESCE(s_ty.sales_ty, 0) + COALESCE(st_ty.stock_ty, 0)) > 0
            THEN (COALESCE(s_ty.sales_ty, 0) / (COALESCE(s_ty.sales_ty, 0) + COALESCE(st_ty.stock_ty, 0))) * 100
            ELSE NULL
          END
          -
          CASE
            WHEN (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0)) > 0
            THEN (COALESCE(s_ly.sales_ly, 0) / (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0))) * 100
            ELSE NULL
          END
        ) AS sellthrough_yoy_pp,
      
        CASE
          WHEN COALESCE(s_ly.sales_ly, 0) > 0
          THEN ((COALESCE(s_ty.sales_ty, 0) / COALESCE(s_ly.sales_ly, 0)) - 1) * 100
          ELSE NULL
        END AS sales_yoy_pct,
      
        CASE
          WHEN (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0)) > 0
          THEN (((COALESCE(s_ty.sales_ty, 0) + COALESCE(st_ty.stock_ty, 0)) / (COALESCE(s_ly.sales_ly, 0) + COALESCE(st_ly.stock_ly, 0))) - 1) * 100
          ELSE NULL
        END AS inbound_yoy_pct
      
      FROM sales_ty s_ty
      CROSS JOIN stock_ty st_ty
      CROSS JOIN sales_ly s_ly
      CROSS JOIN stock_ly st_ly
    `;

    const headerRows = await executeSnowflakeQuery(headerQuery, [
      // TY - sales_ty
      brand, sesn, startDateStr, date,
      // TY - latest_stock_date_ty
      brand, sesn, date,
      // TY - stock_ty
      brand, sesn,
      // LY - sales_ly
      brand, sesnLY, startDateStrLY, dateLY,
      // LY - latest_stock_date_ly
      brand, sesnLY, dateLY,
      // LY - stock_ly
      brand, sesnLY
    ]);

    const headerData = headerRows[0] || {};
    const totalSales = parseFloat(headerData.SALES_TY || 0);
    const totalStock = parseFloat(headerData.STOCK_TY || 0);
    const totalInbound = parseFloat(headerData.INBOUND_TY || 0);
    const overall_sellthrough = headerData.SELLTHROUGH_TY !== null ? parseFloat(headerData.SELLTHROUGH_TY) : 0;
    
    const sellthrough_yoy_pp = headerData.SELLTHROUGH_YOY_PP !== null ? parseFloat(headerData.SELLTHROUGH_YOY_PP) : null;
    const sales_yoy_pct = headerData.SALES_YOY_PCT !== null ? parseFloat(headerData.SALES_YOY_PCT) : null;
    const inbound_yoy_pct = headerData.INBOUND_YOY_PCT !== null ? parseFloat(headerData.INBOUND_YOY_PCT) : null;

    console.log('📊 Header YoY Calculation:', {
      params: {
        asof_date_ty: date,
        sesn_ty: sesn,
        start_date_ty: startDateStr,
        asof_date_ly: dateLY,
        sesn_ly: sesnLY,
        start_date_ly: startDateStrLY,
      },
      ty: { 
        sales: totalSales, 
        stock: totalStock, 
        stock_dt: headerData.STOCK_DT_TY,
        inbound: totalInbound, 
        sellthrough: overall_sellthrough 
      },
      ly: { 
        sales: headerData.SALES_LY, 
        stock: headerData.STOCK_LY,
        stock_dt: headerData.STOCK_DT_LY,
        inbound: headerData.INBOUND_LY, 
        sellthrough: headerData.SELLTHROUGH_LY 
      },
      yoy: { sellthrough_yoy_pp, sales_yoy_pct, inbound_yoy_pct },
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
          SUM(s.TAG_STOCK_AMT) AS stock_tag
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
          SUM(TAG_SALE_AMT) AS sales_tag
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
      sellthrough: parseFloat(r.SELLTHROUGH_PCT || 0),
    }));

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
        // YoY 추가 (NULL 가능)
        sellthrough_yoy_pp: sellthrough_yoy_pp !== null ? Math.round(sellthrough_yoy_pp * 100) / 100 : null,
        sales_yoy_pct: sales_yoy_pct !== null ? Math.round(sales_yoy_pct * 100) / 100 : null,
        inbound_yoy_pct: inbound_yoy_pct !== null ? Math.round(inbound_yoy_pct * 100) / 100 : null,
      },
      all_products: allProducts, // 전체 품번 데이터
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
