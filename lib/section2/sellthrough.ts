import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getAllStoresByRegionBrand, getStoresByRegionBrandChannel } from '@/lib/store-utils';
import { getSeasonCode, getSection2StartDate, formatDateYYYYMMDD } from '@/lib/date-utils';
import { getApparelCategories } from '@/lib/category-utils.server';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';

/**
 * Section2 Sellthrough Payload
 */
export interface SellthroughPayload {
  asof_date: string;
  cum_start_date: string;
  stock_dt_used: string;
  region: string;
  brand: string;
  category_filter: string;
  header: {
    sesn: string;
    overall_sellthrough: number;
    total_inbound: number;
    total_sales: number;
    overall_sellthrough_ly: number | null;
    total_inbound_ly: number;
    total_sales_ly: number;
    sellthrough_yoy_pp: number | null;
    sales_yoy_pct: number | null;
    inbound_yoy_pct: number | null;
  };
  categories: any[];
  category_total: any;
  all_products: any[];
  no_inbound: any[];
}

/**
 * Section2 Sellthrough 데이터 조회
 */
export async function fetchSection2Sellthrough({
  region,
  brand,
  date,
  categoryFilter = 'clothes',
}: {
  region: string;
  brand: string;
  date: string;
  categoryFilter?: string;
}): Promise<SellthroughPayload> {
  // 시즌 코드 계산 (THIS YEAR)
  const asofDate = new Date(date);
  const sesn = getSeasonCode(asofDate);

  // 섹션2 계산 시작일: 시즌 시작일 - 6개월
  const startDate = new Date(getSection2StartDate(asofDate));
  startDate.setMonth(startDate.getMonth() - 6);
  const startDateStr = formatDateYYYYMMDD(startDate);

  // 전년(LAST YEAR) 날짜 및 시즌 계산
  const asofDateLY = new Date(asofDate);
  asofDateLY.setFullYear(asofDateLY.getFullYear() - 1);
  const dateLY = formatDateYYYYMMDD(asofDateLY);
  const sesnLY = getSeasonCode(asofDateLY);

  const startDateLY = new Date(getSection2StartDate(asofDateLY));
  startDateLY.setMonth(startDateLY.getMonth() - 6);
  const startDateLYStr = formatDateYYYYMMDD(startDateLY);
  const prepStockCutoff = '2025-10-01';
  const usePrepStockTy = date < prepStockCutoff;
  const usePrepStockLy = dateLY < prepStockCutoff;

  console.log('📅 Date & Season Calculation:', {
    current: { date, sesn, startDate: startDateStr },
    lastYear: { date: dateLY, sesn: sesnLY, startDate: startDateLYStr },
  });

  // 매장 코드 준비
  const allStoreCodes = getAllStoresByRegionBrand(region, brand);
  const salesStoreCodes = getStoresByRegionBrandChannel(region, brand, true); // warehouse 제외

  if (allStoreCodes.length === 0 || salesStoreCodes.length === 0) {
    return {
      asof_date: date,
      cum_start_date: startDateStr,
      stock_dt_used: formatDateYYYYMMDD(new Date(new Date(date).getTime() + 86400000)),
      region,
      brand,
      category_filter: categoryFilter,
      header: {
        sesn,
        overall_sellthrough: 0,
        total_inbound: 0,
        total_sales: 0,
        overall_sellthrough_ly: null,
        total_inbound_ly: 0,
        total_sales_ly: 0,
        sellthrough_yoy_pp: null,
        sales_yoy_pct: null,
        inbound_yoy_pct: null,
      },
      categories: [],
      category_total: {
        category: '전체',
        inbound_tag: 0,
        sales_tag: 0,
        inbound_qty: 0,
        sales_qty: 0,
        product_count: 0,
        sellthrough: 0,
      },
      all_products: [],
      no_inbound: [],
    };
  }

  const allStoreCodesStr = allStoreCodes.map((s) => `'${s}'`).join(',');
  const salesStoreCodesStr = salesStoreCodes.map((s) => `'${s}'`).join(',');

  // 의류 카테고리 목록 가져오기 (CSV에서)
  const apparelCategories = getApparelCategories();
  const apparelCategoriesStr = apparelCategories.map((c) => `'${c}'`).join(',');

  console.log('📊 Section2 Params:', {
    region,
    brand,
    date,
    sesn,
    categoryFilter,
    startDate: startDateStr,
    periodInfo: `${startDateStr} ~ ${date}`,
    allStoresCount: allStoreCodes.length,
    salesStoresCount: salesStoreCodes.length,
    apparelCategoriesCount: apparelCategories.length,
  });

  // TW 리전일 때 환율 적용
  const isTwRegion = region === 'TW';
  const period = isTwRegion ? getPeriodFromDateString(date) : '';
  const periodLY = isTwRegion ? getPeriodFromDateString(dateLY) : '';

  // 환율 적용 헬퍼 함수 (TY)
  const applyExchangeRate = (amount: number | null): number | null => {
    if (amount === null) return null;
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, period);
  };

  // 환율 적용 헬퍼 함수 (LY)
  const applyExchangeRateLY = (amount: number | null): number | null => {
    if (amount === null) return null;
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, periodLY);
  };

  // 카테고리 필터 조건 구성
  const productCategoryWhereClause =
    categoryFilter === 'clothes'
      ? `AND SUBSTR(PART_CD, 3, 2) IN (${apparelCategoriesStr})`
      : '';

  const productCategoryWhereClauseWithAlias =
    categoryFilter === 'clothes'
      ? `AND SUBSTR(s.PART_CD, 3, 2) IN (${apparelCategoriesStr})`
      : '';
  const prepCategoryWhereClauseWithAlias =
    categoryFilter === 'clothes'
      ? `AND s.SUB_CTGR IN (${apparelCategoriesStr})`
      : '';

  const buildCategorySnapshotQuery = (usePrepStock: boolean) =>
    usePrepStock
      ? `
    WITH
    latest_stock_yyyymm AS (
      SELECT MAX(YYYYMM) AS stock_yyyymm
      FROM SAP_FNF.PREP_HMD_STOCK
      WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND TO_NUMBER(YYYYMM) <= TO_NUMBER(TO_CHAR(TO_DATE(?), 'YYYYMM'))
    ),
    ending_stock AS (
      SELECT
        s.SUB_CTGR AS category,
        SUM(s.TAG_STOCK_AMT) AS stock_tag
      FROM SAP_FNF.PREP_HMD_STOCK s
      CROSS JOIN latest_stock_yyyymm l
      WHERE
        (CASE WHEN s.BRD_CD IN ('M', 'I') THEN 'M' ELSE s.BRD_CD END) = ?
        AND s.SESN = ?
        AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND s.YYYYMM = l.stock_yyyymm
        ${prepCategoryWhereClauseWithAlias}
      GROUP BY s.SUB_CTGR
    ),
    sales_agg AS (
      SELECT
        SUBSTR(PART_CD, 3, 2) AS category,
        SUM(ACT_SALE_AMT) AS sales_act,
        SUM(TAG_SALE_AMT) AS sales_tag
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE
        (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
        AND SALE_DT BETWEEN ? AND ?
        ${productCategoryWhereClause}
      GROUP BY SUBSTR(PART_CD, 3, 2)
    )
    SELECT
      COALESCE(s.category, e.category) AS category,
      COALESCE(s.sales_act, 0) AS sales_act,
      COALESCE(s.sales_tag, 0) AS sales_tag,
      COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0) AS inbound_tag
    FROM sales_agg s
    FULL OUTER JOIN ending_stock e ON s.category = e.category
    WHERE COALESCE(s.category, e.category) IS NOT NULL
  `
      : `
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
        SUBSTR(s.PART_CD, 3, 2) AS category,
        SUM(s.TAG_STOCK_AMT) AS stock_tag
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
      CROSS JOIN latest_stock_date l
      WHERE
        (CASE WHEN s.BRD_CD IN ('M', 'I') THEN 'M' ELSE s.BRD_CD END) = ?
        AND s.SESN = ?
        AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND s.STOCK_DT = l.stock_dt
        ${productCategoryWhereClauseWithAlias}
      GROUP BY SUBSTR(s.PART_CD, 3, 2)
    ),
    sales_agg AS (
      SELECT
        SUBSTR(PART_CD, 3, 2) AS category,
        SUM(ACT_SALE_AMT) AS sales_act,
        SUM(TAG_SALE_AMT) AS sales_tag
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE
        (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
        AND SALE_DT BETWEEN ? AND ?
        ${productCategoryWhereClause}
      GROUP BY SUBSTR(PART_CD, 3, 2)
    )
    SELECT
      COALESCE(s.category, e.category) AS category,
      COALESCE(s.sales_act, 0) AS sales_act,
      COALESCE(s.sales_tag, 0) AS sales_tag,
      COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0) AS inbound_tag
    FROM sales_agg s
    FULL OUTER JOIN ending_stock e ON s.category = e.category
    WHERE COALESCE(s.category, e.category) IS NOT NULL
  `;

  const fetchCategorySnapshot = async ({
    usePrepStock,
    season,
    asofDate,
    startDate,
    applyRate,
  }: {
    usePrepStock: boolean;
    season: string;
    asofDate: string;
    startDate: string;
    applyRate: (amount: number | null) => number | null;
  }) => {
    const query = buildCategorySnapshotQuery(usePrepStock);
    const binds = [brand, season, asofDate, brand, season, brand, season, startDate, asofDate];
    const rows = await executeSnowflakeQuery(query, binds);
    const result = new Map<string, { sales_act: number; sales_tag: number; inbound_tag: number }>();
    rows.forEach((r: any) => {
      const category = String(r.CATEGORY || '').trim();
      if (!category) return;
      result.set(category, {
        sales_act: applyRate(parseFloat(r.SALES_ACT || 0)) || 0,
        sales_tag: applyRate(parseFloat(r.SALES_TAG || 0)) || 0,
        inbound_tag: applyRate(parseFloat(r.INBOUND_TAG || 0)) || 0,
      });
    });
    return result;
  };

  const tyLatestStockCte = usePrepStockTy
    ? `
    latest_stock_yyyymm_ty AS (
      SELECT MAX(YYYYMM) AS stock_yyyymm
      FROM SAP_FNF.PREP_HMD_STOCK
      WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND TO_NUMBER(YYYYMM) <= TO_NUMBER(TO_CHAR(TO_DATE(?), 'YYYYMM'))
    ),
    stock_ty AS (
      SELECT
        SUM(s.TAG_STOCK_AMT) AS stock_ty,
        MAX(TO_DATE(TO_VARCHAR(l.stock_yyyymm) || '01', 'YYYYMMDD')) AS stock_dt_used
      FROM SAP_FNF.PREP_HMD_STOCK s
      CROSS JOIN latest_stock_yyyymm_ty l
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
        AND s.SESN = ?
        AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND s.YYYYMM = l.stock_yyyymm
        ${prepCategoryWhereClauseWithAlias}
    ),
    `
    : `
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
        ${productCategoryWhereClauseWithAlias}
    ),
    `;

  const lyLatestStockCte = usePrepStockLy
    ? `
    latest_stock_yyyymm_ly AS (
      SELECT MAX(YYYYMM) AS stock_yyyymm
      FROM SAP_FNF.PREP_HMD_STOCK
      WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND TO_NUMBER(YYYYMM) <= TO_NUMBER(TO_CHAR(TO_DATE(?), 'YYYYMM'))
    ),
    stock_ly AS (
      SELECT
        SUM(s.TAG_STOCK_AMT) AS stock_ly,
        MAX(TO_DATE(TO_VARCHAR(l.stock_yyyymm) || '01', 'YYYYMMDD')) AS stock_dt_used
      FROM SAP_FNF.PREP_HMD_STOCK s
      CROSS JOIN latest_stock_yyyymm_ly l
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
        AND s.SESN = ?
        AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND s.YYYYMM = l.stock_yyyymm
        ${prepCategoryWhereClauseWithAlias}
    )
    `
    : `
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
        ${productCategoryWhereClauseWithAlias}
    )
    `;

  // 헤더용 SQL (TY + LY)
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
        ${productCategoryWhereClause}
    ),
    ${tyLatestStockCte}
    -- LAST YEAR (LY)
    sales_ly AS (
      SELECT SUM(TAG_SALE_AMT) AS sales_ly
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
        AND SALE_DT BETWEEN ? AND ?
        ${productCategoryWhereClause}
    ),
    ${lyLatestStockCte}
    
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
      END AS sellthrough_ly
    
    FROM sales_ty s_ty
    CROSS JOIN stock_ty st_ty
    CROSS JOIN sales_ly s_ly
    CROSS JOIN stock_ly st_ly
  `;

  const headerBinds: any[] = [
    // TY - sales_ty
    brand,
    sesn,
    startDateStr,
    date,
    // TY - stock source
    brand,
    sesn,
    date,
    brand,
    sesn,
    // LY - sales_ly
    brand,
    sesnLY,
    startDateLYStr,
    dateLY,
    // LY - stock source
    brand,
    sesnLY,
    dateLY,
    brand,
    sesnLY,
  ];
  const headerRows = await executeSnowflakeQuery(headerQuery, headerBinds);

  const headerData = headerRows[0] || {};
  // 환율 적용하여 데이터 변환
  const totalSales = applyExchangeRate(parseFloat(headerData.SALES_TY || 0)) || 0;
  const totalStock = applyExchangeRate(parseFloat(headerData.STOCK_TY || 0)) || 0;
  const totalInbound = applyExchangeRate(parseFloat(headerData.INBOUND_TY || 0)) || 0;
  const overall_sellthrough =
    headerData.SELLTHROUGH_TY !== null ? parseFloat(headerData.SELLTHROUGH_TY) : 0;

  // LY data (YoY 비교용, 환율 적용)
  const totalSalesLY = applyExchangeRateLY(parseFloat(headerData.SALES_LY || 0)) || 0;
  const totalInboundLY = applyExchangeRateLY(parseFloat(headerData.INBOUND_LY || 0)) || 0;
  const overall_sellthrough_ly =
    headerData.SELLTHROUGH_LY !== null ? parseFloat(headerData.SELLTHROUGH_LY) : null;

  // 품번별 데이터 조회
  const productQuery = usePrepStockTy
    ? `
    WITH 
    latest_stock_yyyymm AS (
      SELECT MAX(YYYYMM) AS stock_yyyymm
      FROM SAP_FNF.PREP_HMD_STOCK
      WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND TO_NUMBER(YYYYMM) <= TO_NUMBER(TO_CHAR(TO_DATE(?), 'YYYYMM'))
    ),
    ending_stock AS (
      SELECT 
        s.SUB_CTGR AS PRDT_CD,
        CONCAT('XX', s.SUB_CTGR) AS PART_CD,
        SUM(s.TAG_STOCK_AMT) AS stock_tag,
        SUM(s.STOCK_QTY) AS stock_qty
      FROM SAP_FNF.PREP_HMD_STOCK s
      CROSS JOIN latest_stock_yyyymm l
      WHERE 
        (CASE WHEN s.BRD_CD IN ('M', 'I') THEN 'M' ELSE s.BRD_CD END) = ?
        AND s.SESN = ?
        AND s.LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND s.YYYYMM = l.stock_yyyymm
        ${prepCategoryWhereClauseWithAlias}
      GROUP BY s.SUB_CTGR
    ),
    sales_agg AS (
      SELECT
        SUBSTR(PART_CD, 3, 2) AS PRDT_CD,
        CONCAT('XX', SUBSTR(PART_CD, 3, 2)) AS PART_CD,
        SUM(ACT_SALE_AMT) AS sales_act,
        SUM(TAG_SALE_AMT) AS sales_tag,
        SUM(SALE_QTY) AS sales_qty
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE 
        (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
        AND SALE_DT BETWEEN ? AND ?
        ${productCategoryWhereClause}
      GROUP BY SUBSTR(PART_CD, 3, 2)
    )
    SELECT
      COALESCE(s.PRDT_CD, e.PRDT_CD) AS prdt_cd,
      SUBSTR(COALESCE(e.PART_CD, s.PART_CD), 3, 2) AS category,
      COALESCE(s.sales_act, 0) AS sales_act,
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
  `
    : `
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
        ${productCategoryWhereClauseWithAlias}
      GROUP BY s.PRDT_CD
    ),
    sales_agg AS (
      SELECT 
        PRDT_CD, 
        ANY_VALUE(PART_CD) AS PART_CD, 
        SUM(ACT_SALE_AMT) AS sales_act,
        SUM(TAG_SALE_AMT) AS sales_tag,
        SUM(SALE_QTY) AS sales_qty
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE 
        (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
        AND SALE_DT BETWEEN ? AND ?
        ${productCategoryWhereClause}
      GROUP BY PRDT_CD
    )
    SELECT
      COALESCE(s.PRDT_CD, e.PRDT_CD) AS prdt_cd,
      SUBSTR(COALESCE(e.PART_CD, s.PART_CD), 3, 2) AS category,
      COALESCE(s.sales_act, 0) AS sales_act,
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

  const productRowsBinds = [
    brand,
    sesn,
    date,
    brand,
    sesn,
    brand,
    sesn,
    startDateStr,
    date,
  ];

  const rows = await executeSnowflakeQuery(productQuery, productRowsBinds);
  const categoryLySnapshot = await fetchCategorySnapshot({
    usePrepStock: usePrepStockLy,
    season: sesnLY,
    asofDate: dateLY,
    startDate: startDateLYStr,
    applyRate: applyExchangeRateLY,
  });

  const categoryPeriodQuery = `
    SELECT
      SUBSTR(PART_CD, 3, 2) AS category,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS ytd_sales_act,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS ytd_sales_tag,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS ytd_sales_act_ly,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS ytd_sales_tag_ly,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS mtd_sales_act,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS mtd_sales_tag,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS mtd_sales_act_ly,
      SUM(
        CASE
          WHEN SESN = ? AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS mtd_sales_tag_ly
    FROM SAP_FNF.DW_HMD_SALE_D
    WHERE
      (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
      AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND TO_DATE(?)
      ${productCategoryWhereClause}
    GROUP BY SUBSTR(PART_CD, 3, 2)
  `;

  const categoryPeriodRows = await executeSnowflakeQuery(categoryPeriodQuery, [
    sesn, date, date,
    sesn, date, date,
    sesnLY, date, date,
    sesnLY, date, date,
    sesn, date, date,
    sesn, date, date,
    sesnLY, date, date,
    sesnLY, date, date,
    brand,
    date,
    date,
  ]);
  const categoryPeriodMap = new Map<
    string,
    {
      ytd_sales_act: number;
      ytd_sales_tag: number;
      ytd_sales_act_ly: number;
      ytd_sales_tag_ly: number;
      mtd_sales_act: number;
      mtd_sales_tag: number;
      mtd_sales_act_ly: number;
      mtd_sales_tag_ly: number;
    }
  >();
  categoryPeriodRows.forEach((r: any) => {
    const category = String(r.CATEGORY || '').trim();
    if (!category) return;
    categoryPeriodMap.set(category, {
      ytd_sales_act: applyExchangeRate(parseFloat(r.YTD_SALES_ACT || 0)) || 0,
      ytd_sales_tag: applyExchangeRate(parseFloat(r.YTD_SALES_TAG || 0)) || 0,
      ytd_sales_act_ly: applyExchangeRateLY(parseFloat(r.YTD_SALES_ACT_LY || 0)) || 0,
      ytd_sales_tag_ly: applyExchangeRateLY(parseFloat(r.YTD_SALES_TAG_LY || 0)) || 0,
      mtd_sales_act: applyExchangeRate(parseFloat(r.MTD_SALES_ACT || 0)) || 0,
      mtd_sales_tag: applyExchangeRate(parseFloat(r.MTD_SALES_TAG || 0)) || 0,
      mtd_sales_act_ly: applyExchangeRateLY(parseFloat(r.MTD_SALES_ACT_LY || 0)) || 0,
      mtd_sales_tag_ly: applyExchangeRateLY(parseFloat(r.MTD_SALES_TAG_LY || 0)) || 0,
    });
  });

  // sales_tag > 0 또는 stock_tag > 0 데이터만 필터
  const validRows = rows.filter(
    (r: any) => parseFloat(r.SALES_TAG || 0) > 0 || parseFloat(r.STOCK_TAG || 0) > 0
  );

  // stock_dt_used (실제 사용된 재고 날짜)
  const stockDtUsed = headerData.STOCK_DT_TY
    ? formatDateYYYYMMDD(new Date(headerData.STOCK_DT_TY))
    : formatDateYYYYMMDD(new Date(new Date(date).getTime() + 86400000));

  // 전체 데이터 매핑 (환율 적용)
  const allProducts = validRows.map((r: any) => ({
    prdt_cd: r.PRDT_CD,
    category: r.CATEGORY,
    sales_act: applyExchangeRate(parseFloat(r.SALES_ACT || 0)) || 0,
    inbound_tag: applyExchangeRate(parseFloat(r.INBOUND_TAG || 0)) || 0,
    sales_tag: applyExchangeRate(parseFloat(r.SALES_TAG || 0)) || 0,
    inbound_qty: parseInt(r.INBOUND_QTY || 0),
    sales_qty: parseInt(r.SALES_QTY || 0),
    sellthrough: parseFloat(r.SELLTHROUGH_PCT || 0),
  }));

  // 중분류별 집계 (카테고리 그룹핑)
  const categoryMap = new Map<string, any>();

  allProducts.forEach((product) => {
    const cat = product.category || 'UNKNOWN';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, {
        category: cat,
        sales_act: 0,
        inbound_tag: 0,
        sales_tag: 0,
        sales_act_ly: 0,
        inbound_tag_ly: 0,
        sales_tag_ly: 0,
        inbound_qty: 0,
        sales_qty: 0,
        product_count: 0,
      });
    }

    const catData = categoryMap.get(cat);
    catData.sales_act += product.sales_act;
    catData.inbound_tag += product.inbound_tag;
    catData.sales_tag += product.sales_tag;
    catData.inbound_qty += product.inbound_qty;
    catData.sales_qty += product.sales_qty;
    catData.product_count += 1;
  });

  // 판매율 계산 및 배열 변환
  const categories = Array.from(categoryMap.values())
    .map((cat) => ({
      ...cat,
      sales_act: cat.sales_act,
      sales_tag: cat.sales_tag,
      sales_act_ly: categoryLySnapshot.get(cat.category)?.sales_act || 0,
      sales_tag_ly: categoryLySnapshot.get(cat.category)?.sales_tag || 0,
      mtd_sales_act: categoryPeriodMap.get(cat.category)?.mtd_sales_act || 0,
      mtd_sales_tag: categoryPeriodMap.get(cat.category)?.mtd_sales_tag || 0,
      mtd_sales_act_ly: categoryPeriodMap.get(cat.category)?.mtd_sales_act_ly || 0,
      mtd_sales_tag_ly: categoryPeriodMap.get(cat.category)?.mtd_sales_tag_ly || 0,
      sellthrough: cat.inbound_tag > 0 ? (cat.sales_tag / cat.inbound_tag) * 100 : 0,
    }))
    .map((cat) => {
      const discountRate = cat.sales_tag > 0 ? (1 - cat.sales_act / cat.sales_tag) * 100 : null;
      const discountRateLy =
        cat.sales_tag_ly > 0 ? (1 - cat.sales_act_ly / cat.sales_tag_ly) * 100 : null;
      const mtdDiscountRate = cat.mtd_sales_tag > 0 ? (1 - cat.mtd_sales_act / cat.mtd_sales_tag) * 100 : null;
      const mtdDiscountRateLy =
        cat.mtd_sales_tag_ly > 0 ? (1 - cat.mtd_sales_act_ly / cat.mtd_sales_tag_ly) * 100 : null;
      return {
        ...cat,
        cum_basis: 'season_minus_6m',
        period_scope: 'season',
        sales_yoy_pct: cat.sales_tag_ly > 0 ? (cat.sales_tag / cat.sales_tag_ly) * 100 : null,
        mtd_sales_yoy_pct: cat.mtd_sales_tag_ly > 0 ? (cat.mtd_sales_tag / cat.mtd_sales_tag_ly) * 100 : null,
        discount_rate: discountRate,
        discount_rate_ly: discountRateLy,
        discount_rate_diff:
          discountRate !== null && discountRateLy !== null ? discountRate - discountRateLy : null,
        mtd_discount_rate: mtdDiscountRate,
        mtd_discount_rate_ly: mtdDiscountRateLy,
        mtd_discount_rate_diff:
          mtdDiscountRate !== null && mtdDiscountRateLy !== null ? mtdDiscountRate - mtdDiscountRateLy : null,
      };
    });

  // 전체 합계 계산 (필터링된 품번 기준)
  const category_total = {
    category: '전체',
    inbound_tag: categories.reduce((sum, c) => sum + c.inbound_tag, 0),
    sales_tag: categories.reduce((sum, c) => sum + c.sales_tag, 0),
    inbound_qty: categories.reduce((sum, c) => sum + c.inbound_qty, 0),
    sales_qty: categories.reduce((sum, c) => sum + c.sales_qty, 0),
    product_count: categories.reduce((sum, c) => sum + c.product_count, 0),
    sellthrough: 0,
  };
  category_total.sellthrough =
    category_total.inbound_tag > 0
      ? (category_total.sales_tag / category_total.inbound_tag) * 100
      : 0;

  // 헤더 데이터를 필터링된 품번 집계로 재계산
  const filteredTotalSales = category_total.sales_tag;
  const filteredTotalInbound = category_total.inbound_tag;
  const filteredSellthrough = category_total.sellthrough;

  // YoY 계산
  const sellthrough_yoy_pp =
    overall_sellthrough_ly !== null ? filteredSellthrough - overall_sellthrough_ly : null;

  const sales_yoy_pct = totalSalesLY > 0 ? (filteredTotalSales / totalSalesLY) * 100 : null;
  const inbound_yoy_pct = totalInboundLY > 0 ? (filteredTotalInbound / totalInboundLY) * 100 : null;

  const no_inbound: any[] = [];

  return {
    asof_date: date,
    cum_start_date: startDateStr,
    stock_dt_used: stockDtUsed,
    region,
    brand,
    category_filter: categoryFilter,
    header: {
      sesn,
      overall_sellthrough: Math.round(filteredSellthrough * 100) / 100,
      total_inbound: filteredTotalInbound,
      total_sales: filteredTotalSales,
      // LY values
      overall_sellthrough_ly:
        overall_sellthrough_ly !== null ? Math.round(overall_sellthrough_ly * 100) / 100 : null,
      total_inbound_ly: totalInboundLY,
      total_sales_ly: totalSalesLY,
      // YoY metrics
      sellthrough_yoy_pp:
        sellthrough_yoy_pp !== null ? Math.round(sellthrough_yoy_pp * 100) / 100 : null,
      sales_yoy_pct: sales_yoy_pct !== null ? Math.round(sales_yoy_pct * 100) / 100 : null,
      inbound_yoy_pct: inbound_yoy_pct !== null ? Math.round(inbound_yoy_pct * 100) / 100 : null,
    },
    categories,
    category_total,
    all_products: allProducts,
    no_inbound,
  };
}
