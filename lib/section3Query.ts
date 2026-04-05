import { executeSnowflakeQuery } from '@/lib/snowflake';
import { normalizeBrand, getAllStoresByRegionBrand, getStoresByRegionBrandChannel } from '@/lib/store-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';
import { formatDateYYYYMMDD } from '@/lib/date-utils';
import { getApparelCategories } from '@/lib/category-utils.server';
import { getCategoryMapping } from '@/lib/category-utils';
import {
  getSection3MonthCode,
  getSection3Target,
  getSection3YearBucketTargets,
  getSection3YearBucketTargetWindows,
  type Section3TargetCategory,
} from '@/lib/section3-targets.server';

export interface Section3Response {
  asof_date: string;
  base_stock_date: string;
  period_start_date: string;
  season_type: string;
  region: string;
  brand: string;
  header: {
    year_bucket: string;
    base_stock_amt: number;
    curr_stock_amt: number;
    ly_curr_stock_amt: number | null;
    curr_stock_yoy_pct: number | null;
    prev_month_curr_stock_amt: number;
    curr_stock_change: number;
    stagnant_stock_amt: number;
    prev_month_stagnant_stock_amt: number;
    stagnant_ratio: number;
    prev_month_stagnant_ratio: number;
    depleted_stock_amt: number;
    period_tag_sales: number;
    period_tag_sales_ly: number | null;
    period_act_sales: number;
    period_act_sales_ly: number | null;
    current_month_depleted: number;
    current_month_depleted_act: number;
    current_month_depleted_ly?: number | null;
    current_month_discount_rate: number | null;
    discount_rate: number;
    inv_days_raw: number | null;
    inv_days: number | null;
    old_stock_2y_plus_share: number | null;
    old_stock_3y_plus_share: number | null;
    target_info?: {
      available: boolean;
      scope: 'HKMC_ONLY';
      month_code: string;
      category_key: 'wear' | 'accessory' | 'all';
      monthly: {
        target_sold_amt: number | null;
        target_sold_gross: number | null;
        target_discount_rate: number | null;
        actual_sold_amt: number;
        actual_sold_gross: number;
        actual_discount_rate: number | null;
        progress_pct: number | null;
        projected_sold_amt: number | null;
        projected_progress_pct: number | null;
      };
      cumulative: {
        target_sold_amt: number | null;
        target_sold_gross: number | null;
        target_discount_rate: number | null;
        actual_sold_amt: number;
        actual_sold_gross: number;
        actual_discount_rate: number | null;
        progress_pct: number | null;
        projected_sold_amt: number | null;
        projected_progress_pct: number | null;
      };
    } | null;
  } | null;
  years: Array<{
    year_bucket: string;
    season_code: string;
    sesn: string;
    base_stock_amt: number;
    curr_stock_amt: number;
    stagnant_stock_amt: number;
    depleted_stock_amt: number;
    period_tag_sales: number;
    period_act_sales: number;
    current_month_depleted: number;
    discount_rate: number;
    inv_days_raw: number | null;
    inv_days: number | null;
    is_over_1y: boolean;
  }>;
  categories: Array<{
    year_bucket: string;
    cat2: string;
    base_stock_amt: number;
    curr_stock_amt: number;
    stagnant_stock_amt: number;
    depleted_stock_amt: number;
    discount_rate: number;
    inv_days_raw: number | null;
    inv_days: number | null;
    is_over_1y: boolean;
  }>;
  skus: Array<{
    year_bucket: string;
    sesn: string;
    cat2: string;
    prdt_cd: string;
    base_stock_amt: number;
    curr_stock_amt: number;
    stagnant_stock_amt: number;
    depleted_stock_amt: number;
    period_tag_sales: number;
    period_act_sales: number;
  }>;
  summary_cards?: {
    year_cards: Array<{
      year_bucket: string;
      season_code: string;
      curr_stock_amt: number;
      stagnant_stock_amt: number;
      period_tag_sales: number;
      current_month_depleted: number;
      sales_yoy_pct: number | null;
      discount_rate: number;
      target_info: {
        monthly: {
          progress_pct: number | null;
          projected_progress_pct: number | null;
          actual_discount_rate: number | null;
          target_discount_rate: number | null;
        };
        cumulative: {
          progress_pct: number | null;
          projected_progress_pct: number | null;
          actual_discount_rate: number | null;
          target_discount_rate: number | null;
        };
      } | null;
    }>;
    stagnant_card: {
      stagnant_stock_amt: number;
      stagnant_ratio: number;
      prev_month_stagnant_ratio: number;
      curr_stock_amt: number;
      inv_days: number | null;
    } | null;
  };
  target_heatmap?: {
    mode: 'monthly';
    rows: Array<{
      year_bucket: string;
      cells: Array<{
        category_key: 'wear' | 'accessory' | 'all';
        label: string;
        available: boolean;
        completed: boolean;
        actual_sold_amt: number;
        target_sold_gross: number | null;
        progress_pct: number | null;
        projected_progress_pct: number | null;
        actual_discount_rate: number | null;
        target_discount_rate: number | null;
        discount_delta_pct: number | null;
        year_end_target_stock: number | null;
        rolling_year_end_stock: number | null;
        rolling_year_end_gap: number | null;
      }>;
    }>;
  } | null;
  inventory_segment_cards?: Array<{
    key:
      | 'current_s'
      | 'current_f'
      | 'past_s'
      | 'past_f'
      | 'hat'
      | 'shoes'
      | 'bag'
      | 'acc';
    label: string;
    curr_stock_amt: number;
    ly_curr_stock_amt: number | null;
    yoy_pct: number | null;
  }>;
}

/**
 * Execute Section3 old season inventory query and return formatted response
 * 
 * @param region - 'HKMC' or 'TW'
 * @param brand - 'M' or 'X'
 * @param date - YYYY-MM-DD format
 * @returns Section3Response
 */
export async function executeSection3Query(
  region: string,
  brand: string,
  date: string,
  options?: { includeYoY?: boolean; categoryFilter?: 'clothes' | 'all'; lightweight?: boolean }
): Promise<Section3Response> {
  const parseDateAtLocalMidnight = (value: string) => new Date(`${value}T00:00:00`);
  const includeYoY = options?.includeYoY !== false;
  const categoryFilter = options?.categoryFilter === 'clothes' ? 'clothes' : 'all';
  const lightweight = options?.lightweight === true;
  const normalizedBrand = normalizeBrand(brand);
  
  // 釉뚮옖?쒕퀎 議곌굔
  const brandFilter = normalizedBrand === 'M' 
    ? "(CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'M'" 
    : "BRD_CD = 'X'";
  
  // 紐⑤뱺 留ㅼ옣 肄붾뱶 媛?몄삤湲?(region, brand 湲곕컲, warehouse ?ы븿)
  const allStores = getAllStoresByRegionBrand(region, brand);
  const salesStores = getStoresByRegionBrandChannel(region, brand, true);
  
  if (allStores.length === 0) {
    return {
      asof_date: date,
      base_stock_date: '',
      period_start_date: '',
      season_type: '',
      region,
      brand,
      header: null,
      years: [],
      categories: [],
      skus: [],
    };
  }
  
  // 留ㅼ옣 由ъ뒪??CTE ?숈쟻 ?앹꽦
  const shopValues = allStores.map(code => `('${code}')`).join(',\n    ');
  const shopListCTE = `
region_shop AS (
  SELECT column1 AS local_shop_cd
  FROM VALUES
    ${shopValues}
),
`;
  
  const shopFilter = 'AND LOCAL_SHOP_CD IN (SELECT local_shop_cd FROM region_shop)';
  const apparelCategories = getApparelCategories().map((code) => String(code).toUpperCase());
  const apparelCategorySet = new Set(apparelCategories);
  const apparelCategoryList = apparelCategories
    .map((code) => `'${code.replace(/'/g, "''")}'`)
    .join(', ');
  const stockCategoryFilter =
    categoryFilter === 'clothes'
      ? `AND SUBSTR(ST.PRDT_CD, 7, 2) IN (${apparelCategoryList})`
      : '';
  const salesCategoryFilter =
    categoryFilter === 'clothes'
      ? `AND SUBSTR(S.PART_CD, 3, 2) IN (${apparelCategoryList})`
      : '';
  const prepStockCategoryFilter =
    categoryFilter === 'clothes'
      ? `AND SUB_CTGR IN (${apparelCategoryList})`
      : '';
  
  const query = `
WITH
${shopListCTE}
PARAM AS (
  SELECT
    CAST(? AS DATE) AS ASOF_DATE,
    -- ?꾩썡留??좎쭨
    LAST_DAY(DATEADD(MONTH, -1, CAST(? AS DATE))) AS PREV_MONTH_END_DT,
    -- ?뱀썡 1??
    DATE_TRUNC('MONTH', CAST(? AS DATE)) AS CURRENT_MONTH_START_DT,
    -- ?꾩옱 ?쒖쫵 ????먮떒 (9~2??FW, 3~8??SS)
    CASE WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN 'F' ELSE 'S' END AS CUR_TYP,
    -- ?꾩옱 ?쒖쫵 ?곕룄(YY)
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN MOD(YEAR(CAST(? AS DATE)), 100)
      WHEN MONTH(CAST(? AS DATE)) IN (1,2) THEN MOD(YEAR(CAST(? AS DATE)) - 1, 100)
      ELSE MOD(YEAR(CAST(? AS DATE)), 100)
    END AS CUR_YY,
    -- 기초재고일: FW는 고정(2025-09-22), SS는 시즌 시작일(3/1)
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN CAST('2025-09-22' AS DATE)
      ELSE CAST(YEAR(CAST(? AS DATE)) || '-03-01' AS DATE)
    END AS BASE_STOCK_DT,
    -- 소진 시작일: FW 고정(2025-09-23), SS 시즌 시작일(3/1)
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN CAST('2025-09-23' AS DATE)
      ELSE CAST(YEAR(CAST(? AS DATE)) || '-03-01' AS DATE)
    END AS PERIOD_START_DT,
    -- ?먮ℓ湲곌컙 ?쇱닔
    DATEDIFF(day,
      CASE
        WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
          CAST('2025-09-23' AS DATE)
        ELSE
          CAST(YEAR(CAST(? AS DATE)) || '-03-01' AS DATE)
      END,
      CAST(? AS DATE)
    ) + 1 AS PERIOD_DAYS
),

-- 怨쇱떆利?踰꾪궥 ?뺤쓽
SEASON_BUCKETS AS (
  SELECT DISTINCT
    s.SESN,
    CAST(LEFT(s.SESN, 2) AS INTEGER) AS SESN_YY,
    RIGHT(s.SESN, 1) AS SESN_TYP,
    PA.CUR_TYP,
    PA.CUR_YY,
    CASE
      WHEN PA.CUR_TYP='F' AND RIGHT(s.SESN, 1)='F' THEN
        CASE
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = PA.CUR_YY-1 THEN '1년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = PA.CUR_YY-2 THEN '2년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) <= PA.CUR_YY-3 THEN '3년차 이상'
          ELSE NULL
        END
      WHEN PA.CUR_TYP='S' AND RIGHT(s.SESN, 1)='S' THEN
        CASE
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = PA.CUR_YY-1 THEN '1년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = PA.CUR_YY-2 THEN '2년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) <= PA.CUR_YY-3 THEN '3년차 이상'
          ELSE NULL
        END
      ELSE NULL
    END AS YEAR_BUCKET
  FROM (
    SELECT DISTINCT SESN
    FROM SAP_FNF.DW_HMD_SALE_D
    WHERE ${brandFilter}
      AND RIGHT(SESN, 1) IN ('F', 'S')
      ${shopFilter}
    UNION
    SELECT DISTINCT SESN
    FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
    WHERE ${brandFilter}
      AND RIGHT(SESN, 1) IN ('F', 'S')
      ${shopFilter}
  ) s
  CROSS JOIN PARAM PA
  WHERE YEAR_BUCKET IS NOT NULL
),

BASE_STOCK_DT_RESOLVED AS (
  SELECT 
    PA.BASE_STOCK_DT,
    COALESCE(
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT = PA.BASE_STOCK_DT),
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT <= PA.BASE_STOCK_DT)
    ) AS EFFECTIVE_BASE_STOCK_DT
  FROM PARAM PA
),

PREP_BASE_YYYYMM_RESOLVED AS (
  SELECT
    TO_CHAR(PA.BASE_STOCK_DT, 'YYYYMM') AS BASE_YYYYMM,
    COALESCE(
      (
        SELECT MAX(YYYYMM)
        FROM SAP_FNF.PREP_HMD_STOCK
        WHERE ${brandFilter}
          ${shopFilter}
          AND YYYYMM = TO_CHAR(PA.BASE_STOCK_DT, 'YYYYMM')
      ),
      (
        SELECT MAX(YYYYMM)
        FROM SAP_FNF.PREP_HMD_STOCK
        WHERE ${brandFilter}
          ${shopFilter}
          AND TO_NUMBER(YYYYMM) <= TO_NUMBER(TO_CHAR(PA.BASE_STOCK_DT, 'YYYYMM'))
      )
    ) AS EFFECTIVE_BASE_YYYYMM
  FROM PARAM PA
),

CURR_STOCK_DT_RESOLVED AS (
  SELECT 
    PA.ASOF_DATE,
    COALESCE(
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT = DATEADD(day, 1, PA.ASOF_DATE)),
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT <= DATEADD(day, 1, PA.ASOF_DATE))
    ) AS EFFECTIVE_CURR_STOCK_DT
  FROM PARAM PA
),

BASE_STOCK_SNAP_RAW AS (
  SELECT
    ST.SESN,
    ST.PRDT_CD,
    SUBSTR(ST.PRDT_CD, 7, 2) AS CAT2,
    SUM(ST.TAG_STOCK_AMT) AS BASE_STOCK_AMT
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D ST
  CROSS JOIN PARAM PA
  CROSS JOIN BASE_STOCK_DT_RESOLVED BSD
  WHERE ${brandFilter}
    AND RIGHT(ST.SESN, 1) = PA.CUR_TYP
    ${shopFilter}
    ${stockCategoryFilter}
    AND PA.BASE_STOCK_DT >= CAST('2025-09-22' AS DATE)
    AND ST.STOCK_DT = BSD.EFFECTIVE_BASE_STOCK_DT
  GROUP BY ST.SESN, ST.PRDT_CD

  UNION ALL

  SELECT
    ST.SESN,
    CONCAT('XX', ST.SUB_CTGR) AS PRDT_CD,
    ST.SUB_CTGR AS CAT2,
    SUM(ST.TAG_STOCK_AMT) AS BASE_STOCK_AMT
  FROM SAP_FNF.PREP_HMD_STOCK ST
  CROSS JOIN PARAM PA
  CROSS JOIN PREP_BASE_YYYYMM_RESOLVED PBR
  WHERE ${brandFilter}
    AND RIGHT(ST.SESN, 1) = PA.CUR_TYP
    ${shopFilter}
    ${prepStockCategoryFilter}
    AND PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
    AND ST.YYYYMM = PBR.EFFECTIVE_BASE_YYYYMM
  GROUP BY ST.SESN, ST.SUB_CTGR
),

BASE_STOCK_SNAP AS (
  SELECT
    SB.YEAR_BUCKET,
    BS.SESN,
    BS.PRDT_CD,
    BS.CAT2,
    BS.BASE_STOCK_AMT
  FROM BASE_STOCK_SNAP_RAW BS
  INNER JOIN SEASON_BUCKETS SB ON BS.SESN = SB.SESN
  WHERE SB.YEAR_BUCKET IS NOT NULL
),

BASE_COHORT_CAT AS (
  SELECT DISTINCT
    YEAR_BUCKET,
    SESN,
    CAT2
  FROM BASE_STOCK_SNAP
),

CURR_STOCK_SNAP_RAW AS (
  SELECT
    ST.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(ST.PRDT_CD, 7, 2))
      ELSE ST.PRDT_CD
    END AS PRDT_CD,
    SUBSTR(ST.PRDT_CD, 7, 2) AS CAT2,
    SUM(ST.TAG_STOCK_AMT) AS CURR_STOCK_AMT
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D ST
  CROSS JOIN PARAM PA
  CROSS JOIN CURR_STOCK_DT_RESOLVED CSD
  WHERE ${brandFilter}
    AND RIGHT(ST.SESN, 1) = PA.CUR_TYP
    ${shopFilter}
    ${stockCategoryFilter}
    AND ST.STOCK_DT = CSD.EFFECTIVE_CURR_STOCK_DT
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = ST.SESN
        AND BC.CAT2 = SUBSTR(ST.PRDT_CD, 7, 2)
    )
  GROUP BY
    ST.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(ST.PRDT_CD, 7, 2))
      ELSE ST.PRDT_CD
    END,
    SUBSTR(ST.PRDT_CD, 7, 2)
),

CURR_STOCK_SKU_RAW AS (
  SELECT
    ST.SESN,
    ST.PRDT_CD,
    SUBSTR(ST.PRDT_CD, 7, 2) AS CAT2,
    SUM(ST.TAG_STOCK_AMT) AS CURR_STOCK_AMT
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D ST
  CROSS JOIN PARAM PA
  CROSS JOIN CURR_STOCK_DT_RESOLVED CSD
  WHERE ${brandFilter}
    AND RIGHT(ST.SESN, 1) = PA.CUR_TYP
    ${shopFilter}
    ${stockCategoryFilter}
    AND ST.STOCK_DT = CSD.EFFECTIVE_CURR_STOCK_DT
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = ST.SESN
        AND BC.CAT2 = SUBSTR(ST.PRDT_CD, 7, 2)
    )
  GROUP BY ST.SESN, ST.PRDT_CD, SUBSTR(ST.PRDT_CD, 7, 2)
),

CURR_STOCK_SNAP AS (
  SELECT
    SB.YEAR_BUCKET,
    CS.SESN,
    CS.PRDT_CD,
    CS.CAT2,
    CS.CURR_STOCK_AMT
  FROM CURR_STOCK_SNAP_RAW CS
  INNER JOIN SEASON_BUCKETS SB ON CS.SESN = SB.SESN
  WHERE SB.YEAR_BUCKET IS NOT NULL
),

PERIOD_SALES AS (
  SELECT
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END AS PRDT_CD,
    SUBSTR(S.PRDT_CD, 7, 2) AS CAT2,
    SUM(S.TAG_SALE_AMT) AS PERIOD_TAG_SALES,
    SUM(S.ACT_SALE_AMT) AS PERIOD_ACT_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN PA.PERIOD_START_DT AND PA.ASOF_DATE
    ${shopFilter}
    ${salesCategoryFilter}
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = S.SESN
        AND BC.CAT2 = SUBSTR(S.PART_CD, 3, 2)
    )
  GROUP BY
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END,
    SUBSTR(S.PRDT_CD, 7, 2)
),

MONTHLY_SALES AS (
  SELECT
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END AS PRDT_CD,
    SUBSTR(S.PRDT_CD, 7, 2) AS CAT2,
    SUM(S.TAG_SALE_AMT) AS MONTHLY_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN DATEADD(day, -30, PA.ASOF_DATE) AND PA.ASOF_DATE
    ${shopFilter}
    ${salesCategoryFilter}
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = S.SESN
        AND BC.CAT2 = SUBSTR(S.PART_CD, 3, 2)
    )
  GROUP BY
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END,
    SUBSTR(S.PRDT_CD, 7, 2)
),

MONTHLY_SALES_SKU_RAW AS (
  SELECT
    S.SESN,
    S.PRDT_CD,
    SUBSTR(S.PRDT_CD, 7, 2) AS CAT2,
    SUM(S.TAG_SALE_AMT) AS MONTHLY_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN DATEADD(day, -30, PA.ASOF_DATE) AND PA.ASOF_DATE
    ${shopFilter}
    ${salesCategoryFilter}
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = S.SESN
        AND BC.CAT2 = SUBSTR(S.PART_CD, 3, 2)
    )
  GROUP BY S.SESN, S.PRDT_CD, SUBSTR(S.PRDT_CD, 7, 2)
),

STAGNANT_BY_CAT_PREP AS (
  SELECT
    BC.YEAR_BUCKET,
    BC.CAT2,
    SUM(
      CASE
        WHEN COALESCE(CS.CURR_STOCK_AMT, 0) > 0
          AND (
            COALESCE(MS.MONTHLY_TAG_SALES, 0) = 0
            OR COALESCE(MS.MONTHLY_TAG_SALES, 0) < (COALESCE(CS.CURR_STOCK_AMT, 0) * 0.001)
          )
        THEN COALESCE(CS.CURR_STOCK_AMT, 0)
        ELSE 0
      END
    ) AS STAGNANT_STOCK_AMT
  FROM BASE_COHORT_CAT BC
  INNER JOIN CURR_STOCK_SKU_RAW CS
    ON BC.SESN = CS.SESN
    AND BC.CAT2 = CS.CAT2
  LEFT JOIN MONTHLY_SALES_SKU_RAW MS
    ON CS.SESN = MS.SESN
    AND CS.PRDT_CD = MS.PRDT_CD
  GROUP BY BC.YEAR_BUCKET, BC.CAT2
),

PREV_MONTH_STOCK_DT_RESOLVED AS (
  SELECT 
    PA.PREV_MONTH_END_DT,
    COALESCE(
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT = DATEADD(day, 1, PA.PREV_MONTH_END_DT)),
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT <= DATEADD(day, 1, PA.PREV_MONTH_END_DT))
    ) AS EFFECTIVE_PREV_MONTH_STOCK_DT
  FROM PARAM PA
),

PREV_MONTH_STOCK_RAW AS (
  SELECT
    ST.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(ST.PRDT_CD, 7, 2))
      ELSE ST.PRDT_CD
    END AS PRDT_CD,
    SUM(ST.TAG_STOCK_AMT) AS PREV_CURR_STOCK_AMT
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D ST
  CROSS JOIN PARAM PA
  CROSS JOIN PREV_MONTH_STOCK_DT_RESOLVED PMSD
  WHERE ${brandFilter}
    AND RIGHT(ST.SESN, 1) = PA.CUR_TYP
    ${shopFilter}
    ${stockCategoryFilter}
    AND ST.STOCK_DT = PMSD.EFFECTIVE_PREV_MONTH_STOCK_DT
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = ST.SESN
        AND BC.CAT2 = SUBSTR(ST.PRDT_CD, 7, 2)
    )
  GROUP BY
    ST.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(ST.PRDT_CD, 7, 2))
      ELSE ST.PRDT_CD
    END
),

PREV_MONTH_STOCK AS (
  SELECT
    SB.YEAR_BUCKET,
    PMS.SESN,
    PMS.PRDT_CD,
    PMS.PREV_CURR_STOCK_AMT
  FROM PREV_MONTH_STOCK_RAW PMS
  INNER JOIN SEASON_BUCKETS SB ON PMS.SESN = SB.SESN
  WHERE SB.YEAR_BUCKET IS NOT NULL
),

PREV_MONTH_MONTHLY_SALES AS (
  SELECT
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END AS PRDT_CD,
    SUM(S.TAG_SALE_AMT) AS PREV_MONTHLY_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN DATEADD(day, -30, PA.PREV_MONTH_END_DT) AND PA.PREV_MONTH_END_DT
    ${shopFilter}
    ${salesCategoryFilter}
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = S.SESN
        AND BC.CAT2 = SUBSTR(S.PART_CD, 3, 2)
    )
  GROUP BY
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END
),

CURRENT_MONTH_SALES AS (
  SELECT
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END AS PRDT_CD,
    SUM(S.TAG_SALE_AMT) AS CURRENT_MONTH_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN PA.CURRENT_MONTH_START_DT AND PA.ASOF_DATE
    ${shopFilter}
    ${salesCategoryFilter}
    AND EXISTS (
      SELECT 1
      FROM BASE_COHORT_CAT BC
      WHERE BC.SESN = S.SESN
        AND BC.CAT2 = SUBSTR(S.PART_CD, 3, 2)
    )
  GROUP BY
    SB.YEAR_BUCKET,
    S.SESN,
    CASE
      WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE)
      THEN CONCAT('XX', SUBSTR(S.PART_CD, 3, 2))
      ELSE S.PRDT_CD
    END
),

SKU_LEVEL AS (
  SELECT
    3 AS SORT_LEVEL,
    'SKU' AS ROW_LEVEL,
    COALESCE(BS.YEAR_BUCKET, CS.YEAR_BUCKET, PS.YEAR_BUCKET) AS YEAR_BUCKET,
    COALESCE(BS.SESN, CS.SESN, PS.SESN) AS SESN,
    COALESCE(BS.CAT2, CS.CAT2, PS.CAT2) AS CAT2,
    COALESCE(BS.PRDT_CD, CS.PRDT_CD, PS.PRDT_CD) AS PRDT_CD,
    COALESCE(BS.BASE_STOCK_AMT, 0) AS BASE_STOCK_AMT,
    LEAST(COALESCE(CS.CURR_STOCK_AMT, 0), COALESCE(BS.BASE_STOCK_AMT, 0)) AS CURR_STOCK_AMT,
    CASE
      WHEN LEAST(COALESCE(CS.CURR_STOCK_AMT, 0), COALESCE(BS.BASE_STOCK_AMT, 0)) > 0
        AND (
          COALESCE(MS.MONTHLY_TAG_SALES, 0) = 0
          OR COALESCE(MS.MONTHLY_TAG_SALES, 0) < (LEAST(COALESCE(CS.CURR_STOCK_AMT, 0), COALESCE(BS.BASE_STOCK_AMT, 0)) * 0.001)
        )
      THEN LEAST(COALESCE(CS.CURR_STOCK_AMT, 0), COALESCE(BS.BASE_STOCK_AMT, 0))
      ELSE 0
    END AS STAGNANT_STOCK_AMT,
    (COALESCE(BS.BASE_STOCK_AMT, 0) - LEAST(COALESCE(CS.CURR_STOCK_AMT, 0), COALESCE(BS.BASE_STOCK_AMT, 0))) AS DEPLETED_STOCK_AMT,
    COALESCE(PS.PERIOD_TAG_SALES, 0) AS PERIOD_TAG_SALES,
    COALESCE(PS.PERIOD_ACT_SALES, 0) AS PERIOD_ACT_SALES,
    NULL AS DISCOUNT_RATE,
    NULL AS INV_DAYS_RAW,
    NULL AS INV_DAYS,
    0 AS IS_OVER_1Y,
    PA.PERIOD_DAYS
  FROM BASE_STOCK_SNAP BS
  FULL OUTER JOIN CURR_STOCK_SNAP CS
    ON BS.YEAR_BUCKET = CS.YEAR_BUCKET
    AND BS.SESN = CS.SESN
    AND BS.PRDT_CD = CS.PRDT_CD
  FULL OUTER JOIN PERIOD_SALES PS
    ON COALESCE(BS.YEAR_BUCKET, CS.YEAR_BUCKET) = PS.YEAR_BUCKET
    AND COALESCE(BS.SESN, CS.SESN) = PS.SESN
    AND COALESCE(BS.PRDT_CD, CS.PRDT_CD) = PS.PRDT_CD
  LEFT JOIN MONTHLY_SALES MS
    ON COALESCE(BS.YEAR_BUCKET, CS.YEAR_BUCKET) = MS.YEAR_BUCKET
    AND COALESCE(BS.SESN, CS.SESN) = MS.SESN
    AND COALESCE(BS.PRDT_CD, CS.PRDT_CD) = MS.PRDT_CD
  CROSS JOIN PARAM PA
  WHERE
    COALESCE(BS.BASE_STOCK_AMT, 0) > 0
),

CAT_LEVEL AS (
  SELECT
    2 AS SORT_LEVEL,
    'CAT' AS ROW_LEVEL,
    SL.YEAR_BUCKET AS YEAR_BUCKET,
    NULL AS SESN,
    SL.CAT2 AS CAT2,
    NULL AS PRDT_CD,
    SUM(SL.BASE_STOCK_AMT) AS BASE_STOCK_AMT,
    SUM(SL.CURR_STOCK_AMT) AS CURR_STOCK_AMT,
    CASE
      WHEN MAX(CASE WHEN PA.BASE_STOCK_DT < CAST('2025-09-22' AS DATE) THEN 1 ELSE 0 END) = 1
      THEN COALESCE(MAX(SP.STAGNANT_STOCK_AMT), SUM(SL.STAGNANT_STOCK_AMT))
      ELSE SUM(SL.STAGNANT_STOCK_AMT)
    END AS STAGNANT_STOCK_AMT,
    SUM(SL.DEPLETED_STOCK_AMT) AS DEPLETED_STOCK_AMT,
    SUM(SL.PERIOD_TAG_SALES) AS PERIOD_TAG_SALES,
    SUM(SL.PERIOD_ACT_SALES) AS PERIOD_ACT_SALES,
    CASE
      WHEN SUM(SL.PERIOD_TAG_SALES) > 0
      THEN 1 - (SUM(SL.PERIOD_ACT_SALES) / NULLIF(SUM(SL.PERIOD_TAG_SALES), 0))
      ELSE 0
    END AS DISCOUNT_RATE,
    CASE
      WHEN SUM(SL.PERIOD_TAG_SALES) > 0
      THEN ROUND(SUM(SL.CURR_STOCK_AMT) * MAX(SL.PERIOD_DAYS) / NULLIF(SUM(SL.PERIOD_TAG_SALES), 0))
      ELSE NULL
    END AS INV_DAYS_RAW,
    CASE
      WHEN SUM(SL.PERIOD_TAG_SALES) = 0 THEN -1
      WHEN SUM(SL.PERIOD_TAG_SALES) > 0 THEN
        CASE
          WHEN ROUND(SUM(SL.CURR_STOCK_AMT) * MAX(SL.PERIOD_DAYS) / NULLIF(SUM(SL.PERIOD_TAG_SALES), 0)) > 999 THEN 999
          ELSE ROUND(SUM(SL.CURR_STOCK_AMT) * MAX(SL.PERIOD_DAYS) / NULLIF(SUM(SL.PERIOD_TAG_SALES), 0))
        END
      ELSE NULL
    END AS INV_DAYS,
    CASE
      WHEN SUM(SL.PERIOD_TAG_SALES) = 0 THEN 1
      WHEN ROUND(SUM(SL.CURR_STOCK_AMT) * MAX(SL.PERIOD_DAYS) / NULLIF(SUM(SL.PERIOD_TAG_SALES), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y,
    MAX(SL.PERIOD_DAYS) AS PERIOD_DAYS
  FROM SKU_LEVEL SL
  CROSS JOIN PARAM PA
  LEFT JOIN STAGNANT_BY_CAT_PREP SP
    ON SL.YEAR_BUCKET = SP.YEAR_BUCKET
    AND SL.CAT2 = SP.CAT2
  WHERE SL.CAT2 IS NOT NULL
  GROUP BY SL.YEAR_BUCKET, SL.CAT2
),

YEAR_LEVEL AS (
  SELECT
    1 AS SORT_LEVEL,
    'YEAR' AS ROW_LEVEL,
    YEAR_BUCKET,
    MAX(SESN) AS SESN,
    NULL AS CAT2,
    NULL AS PRDT_CD,
    SUM(BASE_STOCK_AMT) AS BASE_STOCK_AMT,
    SUM(CURR_STOCK_AMT) AS CURR_STOCK_AMT,
    SUM(STAGNANT_STOCK_AMT) AS STAGNANT_STOCK_AMT,
    SUM(DEPLETED_STOCK_AMT) AS DEPLETED_STOCK_AMT,
    SUM(PERIOD_TAG_SALES) AS PERIOD_TAG_SALES,
    SUM(PERIOD_ACT_SALES) AS PERIOD_ACT_SALES,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) > 0
      THEN 1 - (SUM(PERIOD_ACT_SALES) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
      ELSE 0
    END AS DISCOUNT_RATE,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) > 0
      THEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
      ELSE NULL
    END AS INV_DAYS_RAW,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) = 0 THEN -1
      WHEN SUM(PERIOD_TAG_SALES) > 0 THEN
        CASE
          WHEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0)) > 999 THEN 999
          ELSE ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
        END
      ELSE NULL
    END AS INV_DAYS,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) = 0 THEN 1
      WHEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y,
    MAX(PERIOD_DAYS) AS PERIOD_DAYS
  FROM SKU_LEVEL
  GROUP BY YEAR_BUCKET
),

HEADER_LEVEL AS (
  SELECT
    0 AS SORT_LEVEL,
    'HEADER' AS ROW_LEVEL,
    'ALL' AS YEAR_BUCKET,
    NULL AS SESN,
    NULL AS CAT2,
    NULL AS PRDT_CD,
    SUM(BASE_STOCK_AMT) AS BASE_STOCK_AMT,
    SUM(CURR_STOCK_AMT) AS CURR_STOCK_AMT,
    SUM(STAGNANT_STOCK_AMT) AS STAGNANT_STOCK_AMT,
    SUM(DEPLETED_STOCK_AMT) AS DEPLETED_STOCK_AMT,
    SUM(PERIOD_TAG_SALES) AS PERIOD_TAG_SALES,
    SUM(PERIOD_ACT_SALES) AS PERIOD_ACT_SALES,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) > 0
      THEN 1 - (SUM(PERIOD_ACT_SALES) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
      ELSE 0
    END AS DISCOUNT_RATE,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) > 0
      THEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
      ELSE NULL
    END AS INV_DAYS_RAW,
    CASE
      WHEN SUM(PERIOD_TAG_SALES) = 0 THEN -1
      WHEN SUM(PERIOD_TAG_SALES) > 0 THEN
        CASE
          WHEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0)) > 999 THEN 999
          ELSE ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
        END
      ELSE NULL
    END AS INV_DAYS,
    0 AS IS_OVER_1Y,
    MAX(PERIOD_DAYS) AS PERIOD_DAYS,
    (SELECT SUM(PREV_CURR_STOCK_AMT) FROM PREV_MONTH_STOCK) AS PREV_CURR_STOCK_AMT,
    (SELECT SUM(
      CASE
        WHEN PMS.PREV_CURR_STOCK_AMT > 0
          AND (
            COALESCE(PMMS.PREV_MONTHLY_TAG_SALES, 0) = 0
            OR COALESCE(PMMS.PREV_MONTHLY_TAG_SALES, 0) < (PMS.PREV_CURR_STOCK_AMT * 0.001)
          )
        THEN PMS.PREV_CURR_STOCK_AMT
        ELSE 0
      END
    ) FROM PREV_MONTH_STOCK PMS
    LEFT JOIN PREV_MONTH_MONTHLY_SALES PMMS
      ON PMS.YEAR_BUCKET = PMMS.YEAR_BUCKET
      AND PMS.SESN = PMMS.SESN
      AND PMS.PRDT_CD = PMMS.PRDT_CD
    ) AS PREV_STAGNANT_STOCK_AMT,
    (SELECT SUM(CURRENT_MONTH_TAG_SALES) FROM CURRENT_MONTH_SALES) AS CURRENT_MONTH_DEPLETED_AMT
  FROM SKU_LEVEL
)

SELECT
  SORT_LEVEL, ROW_LEVEL, YEAR_BUCKET, SESN, CAT2, PRDT_CD,
  BASE_STOCK_AMT, CURR_STOCK_AMT, STAGNANT_STOCK_AMT, DEPLETED_STOCK_AMT,
  PERIOD_TAG_SALES, PERIOD_ACT_SALES,
  DISCOUNT_RATE, INV_DAYS_RAW, INV_DAYS, IS_OVER_1Y, PERIOD_DAYS,
  PREV_CURR_STOCK_AMT, PREV_STAGNANT_STOCK_AMT, CURRENT_MONTH_DEPLETED_AMT
FROM (
  SELECT *, NULL AS PREV_CURR_STOCK_AMT, NULL AS PREV_STAGNANT_STOCK_AMT, NULL AS CURRENT_MONTH_DEPLETED_AMT FROM SKU_LEVEL
  UNION ALL
  SELECT *, NULL AS PREV_CURR_STOCK_AMT, NULL AS PREV_STAGNANT_STOCK_AMT, NULL AS CURRENT_MONTH_DEPLETED_AMT FROM CAT_LEVEL
  UNION ALL
  SELECT *, NULL AS PREV_CURR_STOCK_AMT, NULL AS PREV_STAGNANT_STOCK_AMT, NULL AS CURRENT_MONTH_DEPLETED_AMT FROM YEAR_LEVEL
  UNION ALL
  SELECT * FROM HEADER_LEVEL
)
ORDER BY
  SORT_LEVEL,
  CASE YEAR_BUCKET
    WHEN 'ALL' THEN 0
    WHEN '1년차' THEN 1
    WHEN '2년차' THEN 2
    WHEN '3년차 이상' THEN 3
    ELSE 99
  END,
  CAT2 NULLS FIRST,
  PRDT_CD NULLS FIRST
`;

  const params = Array(31).fill(date);
  
  console.log(`?뵇 Section3Query - Executing for ${region}:${brand}:${date}`);
  const rowsPromise = executeSnowflakeQuery(query, params);

  // TW 由ъ쟾?????섏쑉 ?곸슜
  const isTwRegion = region === 'TW';
  const period = isTwRegion ? getPeriodFromDateString(date) : '';
  const lyDateObjForRate = new Date(`${date}T00:00:00`);
  lyDateObjForRate.setFullYear(lyDateObjForRate.getFullYear() - 1);
  const lyDateForRate = formatDateYYYYMMDD(lyDateObjForRate);
  const periodLY = isTwRegion ? getPeriodFromDateString(lyDateForRate) : '';
  
  const applyExchangeRate = (amount: number | null): number | null => {
    if (amount === null) return null;
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, period);
  };
  const applyExchangeRateLY = (amount: number | null): number | null => {
    if (amount === null) return null;
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, periodLY);
  };

  // Align section3 card sales metrics with section1 "past season (~prev same season)" scope.
  const salesStoreCodesStr =
    salesStores.length > 0 ? salesStores.map((code) => `'${code.replace(/'/g, "''")}'`).join(',') : "''";
  const asofForSales = new Date(`${date}T00:00:00`);
  const monthForSales = asofForSales.getMonth() + 1;
  const yearForSales = asofForSales.getFullYear();
  const currentTypeForSales = monthForSales >= 9 || monthForSales <= 2 ? 'F' : 'S';
  const currentYYForSales =
    monthForSales >= 9 ? yearForSales % 100 : monthForSales <= 2 ? (yearForSales - 1) % 100 : yearForSales % 100;
  const pastCutoffIndexForSales = (currentYYForSales - 1) * 2 + (currentTypeForSales === 'S' ? 0 : 1);
  const periodStartForSales = currentTypeForSales === 'F' ? '2025-09-23' : `${yearForSales}-03-01`;
  const currentMonthStartForSales = `${yearForSales}-${String(monthForSales).padStart(2, '0')}-01`;
  const lyDateObjForSales = new Date(`${date}T00:00:00`);
  lyDateObjForSales.setFullYear(lyDateObjForSales.getFullYear() - 1);
  const lyDateForSales = formatDateYYYYMMDD(lyDateObjForSales);
  const monthForSalesLy = lyDateObjForSales.getMonth() + 1;
  const yearForSalesLy = lyDateObjForSales.getFullYear();
  const currentTypeForSalesLy = monthForSalesLy >= 9 || monthForSalesLy <= 2 ? 'F' : 'S';
  const currentYYForSalesLy =
    monthForSalesLy >= 9
      ? yearForSalesLy % 100
      : monthForSalesLy <= 2
        ? (yearForSalesLy - 1) % 100
        : yearForSalesLy % 100;
  const pastCutoffIndexForSalesLy =
    (currentYYForSalesLy - 1) * 2 + (currentTypeForSalesLy === 'S' ? 0 : 1);
  const periodStartForSalesLy =
    currentTypeForSalesLy === 'F' ? '2025-09-23' : `${yearForSalesLy}-03-01`;
  const alignedSalesQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS period_tag_sales_total,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.ACT_SALE_AMT ELSE 0 END), 0) AS period_act_sales_total,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS current_month_tag_sales_total,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.ACT_SALE_AMT ELSE 0 END), 0) AS current_month_act_sales_total
    FROM SAP_FNF.DW_HMD_SALE_D S
    WHERE ${brandFilter}
      AND S.LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      ${salesCategoryFilter}
      AND RIGHT(S.SESN, 1) = ?
      AND TRY_TO_NUMBER(LEFT(S.SESN, 2)) <= ?
      AND S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
  `;
  const alignedSeasonSalesQuery = `
    SELECT
      S.SESN,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS PERIOD_TAG_SALES_TOTAL,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.ACT_SALE_AMT ELSE 0 END), 0) AS PERIOD_ACT_SALES_TOTAL,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS CURRENT_MONTH_TAG_SALES_TOTAL,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.ACT_SALE_AMT ELSE 0 END), 0) AS CURRENT_MONTH_ACT_SALES_TOTAL
    FROM SAP_FNF.DW_HMD_SALE_D S
    WHERE ${brandFilter}
      AND S.LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      ${salesCategoryFilter}
      AND RIGHT(S.SESN, 1) = ?
      AND TRY_TO_NUMBER(LEFT(S.SESN, 2)) <= ?
      AND S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
    GROUP BY S.SESN
  `;
  const alignedSeasonCategorySalesQuery = `
    SELECT
      S.SESN,
      SUBSTR(S.PART_CD, 3, 2) AS CAT2,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS PERIOD_TAG_SALES_TOTAL,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.ACT_SALE_AMT ELSE 0 END), 0) AS PERIOD_ACT_SALES_TOTAL,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS CURRENT_MONTH_TAG_SALES_TOTAL,
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.ACT_SALE_AMT ELSE 0 END), 0) AS CURRENT_MONTH_ACT_SALES_TOTAL
    FROM SAP_FNF.DW_HMD_SALE_D S
    WHERE ${brandFilter}
      AND S.LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      AND RIGHT(S.SESN, 1) = ?
      AND TRY_TO_NUMBER(LEFT(S.SESN, 2)) <= ?
      AND S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
      AND SUBSTR(S.PART_CD, 3, 2) IS NOT NULL
    GROUP BY S.SESN, SUBSTR(S.PART_CD, 3, 2)
  `;
  const alignedSalesRowsPromise = executeSnowflakeQuery(alignedSalesQuery, [
    periodStartForSales,
    date,
    periodStartForSales,
    date,
    currentMonthStartForSales,
    date,
    currentMonthStartForSales,
    date,
    currentTypeForSales,
    currentYYForSales - 1,
    periodStartForSales,
    date,
      ]);
  const alignedSalesLyRowsPromise = executeSnowflakeQuery(alignedSalesQuery, [
    periodStartForSalesLy,
    lyDateForSales,
    periodStartForSalesLy,
    lyDateForSales,
    `${yearForSalesLy}-${String(monthForSalesLy).padStart(2, '0')}-01`,
    lyDateForSales,
    `${yearForSalesLy}-${String(monthForSalesLy).padStart(2, '0')}-01`,
    lyDateForSales,
    currentTypeForSalesLy,
    currentYYForSalesLy - 1,
    periodStartForSalesLy,
    lyDateForSales,
  ]);
  const alignedSeasonSalesRowsPromise = executeSnowflakeQuery(alignedSeasonSalesQuery, [
    periodStartForSales,
    date,
    periodStartForSales,
    date,
    currentMonthStartForSales,
    date,
    currentMonthStartForSales,
    date,
    currentTypeForSales,
    currentYYForSales - 1,
    periodStartForSales,
    date,
  ]);
  const alignedSeasonCategorySalesRowsPromise = executeSnowflakeQuery(alignedSeasonCategorySalesQuery, [
    periodStartForSales,
    date,
    periodStartForSales,
    date,
    currentMonthStartForSales,
    date,
    currentMonthStartForSales,
    date,
    currentTypeForSales,
    currentYYForSales - 1,
    periodStartForSales,
    date,
  ]);
  const allStoreCodesStr =
    allStores.length > 0 ? allStores.map((code) => `'${code.replace(/'/g, "''")}'`).join(',') : "''";
  const previousYearEndDate = `${yearForSales - 1}-12-31`;
  const yearToDateStart = `${yearForSales}-01-01`;
  const yearEndStockQuery = `
    WITH latest_stock_date AS (
      SELECT MAX(STOCK_DT) AS stock_dt
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
      WHERE ${brandFilter}
        AND LOCAL_SHOP_CD IN (${allStoreCodesStr})
        AND STOCK_DT <= DATEADD(DAY, 1, TO_DATE(?))
    )
    SELECT
      ST.SESN,
      SUBSTR(ST.PRDT_CD, 7, 2) AS CAT2,
      COALESCE(SUM(ST.TAG_STOCK_AMT), 0) AS YEAR_END_STOCK_AMT
    FROM SAP_FNF.DW_HMD_STOCK_SNAP_D ST
    CROSS JOIN latest_stock_date L
    WHERE ${brandFilter}
      AND ST.LOCAL_SHOP_CD IN (${allStoreCodesStr})
      AND ST.STOCK_DT = L.stock_dt
      AND RIGHT(ST.SESN, 1) = ?
      AND TRY_TO_NUMBER(LEFT(ST.SESN, 2)) <= ?
    GROUP BY ST.SESN, SUBSTR(ST.PRDT_CD, 7, 2)
  `;
  const ytdCategorySalesQuery = `
    SELECT
      S.SESN,
      SUBSTR(S.PART_CD, 3, 2) AS CAT2,
      COALESCE(SUM(S.TAG_SALE_AMT), 0) AS YTD_TAG_SALES_TOTAL
    FROM SAP_FNF.DW_HMD_SALE_D S
    WHERE ${brandFilter}
      AND S.LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      AND RIGHT(S.SESN, 1) = ?
      AND TRY_TO_NUMBER(LEFT(S.SESN, 2)) <= ?
      AND S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
      AND SUBSTR(S.PART_CD, 3, 2) IS NOT NULL
    GROUP BY S.SESN, SUBSTR(S.PART_CD, 3, 2)
  `;
  const yearEndStockRowsPromise = executeSnowflakeQuery(yearEndStockQuery, [
    previousYearEndDate,
    currentTypeForSales,
    currentYYForSales - 1,
  ]);
  const ytdCategorySalesRowsPromise = executeSnowflakeQuery(ytdCategorySalesQuery, [
    currentTypeForSales,
    currentYYForSales - 1,
    yearToDateStart,
    date,
  ]);

  const [
    rows,
    alignedSalesRows,
    alignedSalesLyRows,
    alignedSeasonSalesRows,
    alignedSeasonCategorySalesRows,
    yearEndStockRows,
    ytdCategorySalesRows,
  ] = await Promise.all([
    rowsPromise,
    alignedSalesRowsPromise,
    alignedSalesLyRowsPromise,
    alignedSeasonSalesRowsPromise,
    alignedSeasonCategorySalesRowsPromise,
    yearEndStockRowsPromise,
    ytdCategorySalesRowsPromise,
  ]);
  console.log(`??Section3Query - Result: ${rows.length} rows`);

  const alignedPeriodTagSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.PERIOD_TAG_SALES_TOTAL || 0)) || 0;
  const alignedPeriodActSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.PERIOD_ACT_SALES_TOTAL || 0)) || 0;
  const alignedCurrentMonthTagSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.CURRENT_MONTH_TAG_SALES_TOTAL || 0)) || 0;
  const alignedCurrentMonthActSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.CURRENT_MONTH_ACT_SALES_TOTAL || 0)) || 0;
  const alignedPeriodTagSalesLy =
    applyExchangeRateLY(parseFloat(alignedSalesLyRows?.[0]?.PERIOD_TAG_SALES_TOTAL || 0)) || 0;
  const alignedPeriodActSalesLy =
    applyExchangeRateLY(parseFloat(alignedSalesLyRows?.[0]?.PERIOD_ACT_SALES_TOTAL || 0)) || 0;
  const alignedCurrentMonthTagSalesLy =
    applyExchangeRateLY(parseFloat(alignedSalesLyRows?.[0]?.CURRENT_MONTH_TAG_SALES_TOTAL || 0)) || 0;
  const seasonSalesMap = new Map<
    string,
    { periodTag: number; periodAct: number; monthTag: number; monthAct: number }
  >(
    (alignedSeasonSalesRows || []).map((row: any) => [
      String(row.SESN || '').trim().toUpperCase(),
      {
        periodTag: applyExchangeRate(parseFloat(row.PERIOD_TAG_SALES_TOTAL || 0)) || 0,
        periodAct: applyExchangeRate(parseFloat(row.PERIOD_ACT_SALES_TOTAL || 0)) || 0,
        monthTag: applyExchangeRate(parseFloat(row.CURRENT_MONTH_TAG_SALES_TOTAL || 0)) || 0,
        monthAct: applyExchangeRate(parseFloat(row.CURRENT_MONTH_ACT_SALES_TOTAL || 0)) || 0,
      },
    ])
  );
  const bucketCategorySales = new Map<
    string,
    Record<'wear' | 'accessory' | 'all', { periodTag: number; periodAct: number; monthTag: number; monthAct: number }>
  >([
    ['1년차', { wear: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }, accessory: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }, all: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 } }],
    ['2년차', { wear: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }, accessory: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }, all: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 } }],
    ['3년차 이상', { wear: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }, accessory: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }, all: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 } }],
  ]);
  for (const row of alignedSeasonCategorySalesRows || []) {
    const seasonCode = String(row.SESN || '').trim().toUpperCase();
    const match = seasonCode.match(/^(\d{2})([FS])$/);
    if (!match || match[2] !== currentTypeForSales) continue;
    const seasonYY = Number(match[1]);
    const diff = currentYYForSales - seasonYY;
    const bucket = diff === 1 ? '1년차' : diff === 2 ? '2년차' : diff >= 3 ? '3년차 이상' : null;
    if (!bucket) continue;
    const cat2 = String(row.CAT2 || '').trim().toUpperCase();
    const categoryKey: 'wear' | 'accessory' = apparelCategorySet.has(cat2) ? 'wear' : 'accessory';
    const target = bucketCategorySales.get(bucket);
    if (!target) continue;
    const periodTag = applyExchangeRate(parseFloat(row.PERIOD_TAG_SALES_TOTAL || 0)) || 0;
    const periodAct = applyExchangeRate(parseFloat(row.PERIOD_ACT_SALES_TOTAL || 0)) || 0;
    const monthTag = applyExchangeRate(parseFloat(row.CURRENT_MONTH_TAG_SALES_TOTAL || 0)) || 0;
    const monthAct = applyExchangeRate(parseFloat(row.CURRENT_MONTH_ACT_SALES_TOTAL || 0)) || 0;
    target[categoryKey].periodTag += periodTag;
    target[categoryKey].periodAct += periodAct;
    target[categoryKey].monthTag += monthTag;
    target[categoryKey].monthAct += monthAct;
    target.all.periodTag += periodTag;
    target.all.periodAct += periodAct;
    target.all.monthTag += monthTag;
    target.all.monthAct += monthAct;
  }
  const emptyBucketAmount = () => ({ wear: 0, accessory: 0, all: 0 });
  const bucketYearEndStockMap = new Map<string, Record<'wear' | 'accessory' | 'all', number>>([
    ['1년차', emptyBucketAmount()],
    ['2년차', emptyBucketAmount()],
    ['3년차 이상', emptyBucketAmount()],
  ]);
  const bucketYtdActualSalesMap = new Map<string, Record<'wear' | 'accessory' | 'all', number>>([
    ['1년차', emptyBucketAmount()],
    ['2년차', emptyBucketAmount()],
    ['3년차 이상', emptyBucketAmount()],
  ]);
  const addBucketCategoryAmount = (
    map: Map<string, Record<'wear' | 'accessory' | 'all', number>>,
    bucket: string,
    categoryKey: 'wear' | 'accessory',
    value: number
  ) => {
    const target = map.get(bucket);
    if (!target) return;
    target[categoryKey] += value;
    target.all += value;
  };
  for (const row of yearEndStockRows || []) {
    const seasonCode = String(row.SESN || '').trim().toUpperCase();
    const match = seasonCode.match(/^(\d{2})([FS])$/);
    if (!match || match[2] !== currentTypeForSales) continue;
    const seasonYY = Number(match[1]);
    const diff = currentYYForSales - seasonYY;
    const bucket = diff === 1 ? '1년차' : diff === 2 ? '2년차' : diff >= 3 ? '3년차 이상' : null;
    if (!bucket) continue;
    const cat2 = String(row.CAT2 || '').trim().toUpperCase();
    const categoryKey: 'wear' | 'accessory' = apparelCategorySet.has(cat2) ? 'wear' : 'accessory';
    const yearEndStockAmt = applyExchangeRate(parseFloat(row.YEAR_END_STOCK_AMT || 0)) || 0;
    addBucketCategoryAmount(bucketYearEndStockMap, bucket, categoryKey, yearEndStockAmt);
  }
  for (const row of ytdCategorySalesRows || []) {
    const seasonCode = String(row.SESN || '').trim().toUpperCase();
    const match = seasonCode.match(/^(\d{2})([FS])$/);
    if (!match || match[2] !== currentTypeForSales) continue;
    const seasonYY = Number(match[1]);
    const diff = currentYYForSales - seasonYY;
    const bucket = diff === 1 ? '1년차' : diff === 2 ? '2년차' : diff >= 3 ? '3년차 이상' : null;
    if (!bucket) continue;
    const cat2 = String(row.CAT2 || '').trim().toUpperCase();
    const categoryKey: 'wear' | 'accessory' = apparelCategorySet.has(cat2) ? 'wear' : 'accessory';
    const ytdSalesAmt = applyExchangeRate(parseFloat(row.YTD_TAG_SALES_TOTAL || 0)) || 0;
    addBucketCategoryAmount(bucketYtdActualSalesMap, bucket, categoryKey, ytdSalesAmt);
  }
  const bucketTargetWindows =
    region === 'HKMC'
      ? {
          wear: getSection3YearBucketTargetWindows(date, 'wear'),
          accessory: getSection3YearBucketTargetWindows(date, 'accessory'),
          all: getSection3YearBucketTargetWindows(date, 'all'),
        }
      : null;
  const bucketCurrentMonthSalesMap = new Map<
    string,
    { periodTag: number; periodAct: number; monthTag: number; monthAct: number }
  >([
    ['1년차', { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }],
    ['2년차', { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }],
    ['3년차 이상', { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 }],
  ]);
  for (const [seasonCode, values] of seasonSalesMap.entries()) {
    const match = seasonCode.match(/^(\d{2})([FS])$/);
    if (!match || match[2] !== currentTypeForSales) continue;
    const seasonYY = Number(match[1]);
    const diff = currentYYForSales - seasonYY;
    const bucket = diff === 1 ? '1년차' : diff === 2 ? '2년차' : diff >= 3 ? '3년차 이상' : null;
    if (!bucket) continue;
    const current = bucketCurrentMonthSalesMap.get(bucket)!;
    current.periodTag += values.periodTag;
    current.periodAct += values.periodAct;
    current.monthTag += values.monthTag;
    current.monthAct += values.monthAct;
  }
  const getBucketSeasonSalesMetric = (
    bucket: string,
    metric: 'periodTag' | 'periodAct' | 'monthTag' | 'monthAct',
    shift = 0
  ) => {
    let total = 0;
    for (const [seasonCode, values] of seasonSalesMap.entries()) {
      const match = seasonCode.match(/^(\d{2})([FS])$/);
      if (!match || match[2] !== currentTypeForSales) continue;
      const seasonYY = Number(match[1]);
      const diff = (currentYYForSales - shift) - seasonYY;
      const matchedBucket =
        diff === 1 ? '1년차' : diff === 2 ? '2년차' : diff >= 3 ? '3년차 이상' : null;
      if (matchedBucket === bucket) {
        total += values[metric];
      }
    }
    return total;
  };

  // ?덈꺼蹂??곗씠??遺꾨━
  const header = rows.find((r: any) => r.ROW_LEVEL === 'HEADER');
  const yearRows = rows.filter((r: any) => r.ROW_LEVEL === 'YEAR');
  const catRows = rows.filter((r: any) => r.ROW_LEVEL === 'CAT');
  const skuRows = rows.filter((r: any) => r.ROW_LEVEL === 'SKU');
  const visibleSkuRows = skuRows.filter((r: any) => {
    const code = String(r.PRDT_CD || '').toUpperCase();
    const cat2 = String(r.CAT2 || '').toUpperCase();
    // Internal fallback key for PREP base join (e.g. XXSK) must not be exposed as PRDT_CD.
    return !(code.startsWith('XX') && code.length === 4 && code.slice(2) === cat2);
  });

  // ?좎쭨 怨꾩궛 (?꾨줎???쒖떆??
  const asofDate = parseDateAtLocalMidnight(date);
  const month = asofDate.getMonth() + 1;
  const year = asofDate.getFullYear();
  
  let baseStockDate: string;
  let periodStartDate: string;
  let seasonType: string;
  let currentYY: number;
  
  if (month >= 9 || month <= 2) {
    baseStockDate = '2025-09-22';
    periodStartDate = '2025-09-23';
    seasonType = 'FW';
    currentYY = month >= 9 ? year % 100 : (year - 1) % 100;
  } else {
    baseStockDate = `${year}-03-01`;
    periodStartDate = `${year}-03-01`;
    seasonType = 'SS';
    currentYY = year % 100;
  }

  const getYearBucketSeasonCode = (yearBucket: string): string => {
    const seasonTypeLetter = seasonType === 'FW' ? 'F' : 'S';
    
    if (yearBucket === '1년차') {
      const yy = currentYY - 1;
      return `${yy.toString().padStart(2, '0')}${seasonTypeLetter}`;
    } else if (yearBucket === '2년차') {
      const yy = currentYY - 2;
      return `${yy.toString().padStart(2, '0')}${seasonTypeLetter}`;
    } else if (yearBucket === '3년차 이상') {
      const yy = currentYY - 3;
      return `~${yy.toString().padStart(2, '0')}${seasonTypeLetter}`;
    }
    return '';
  };

  const headerPeriodTagSalesRaw = header ? parseFloat(header.PERIOD_TAG_SALES || 0) : 0;
  const headerPeriodActSalesRaw = header ? parseFloat(header.PERIOD_ACT_SALES || 0) : 0;
  const headerCurrentMonthTagSalesRaw = header ? parseFloat(header.CURRENT_MONTH_DEPLETED_AMT || 0) : 0;
  const resolvedPeriodTagSales = alignedPeriodTagSales;
  const resolvedPeriodActSales = alignedPeriodActSales;
  const resolvedCurrentMonthTagSales = alignedCurrentMonthTagSales;
  const resolvedCurrentMonthActSales = alignedCurrentMonthActSales;
  const resolvedCurrentMonthDiscountRate =
    resolvedCurrentMonthTagSales > 0 ? 1 - resolvedCurrentMonthActSales / resolvedCurrentMonthTagSales : null;
  const yearStockRows = yearRows.map((row: any) => ({
    bucket: String(row.YEAR_BUCKET || '').trim(),
    currStockAmt: applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0,
  }));
  const totalYearStockAmt = yearStockRows.reduce((sum, row) => sum + row.currStockAmt, 0);
  const is2yPlusBucket = (bucket: string) =>
    bucket.includes('2') || bucket.includes('3') || bucket.toLowerCase().includes('2y') || bucket.toLowerCase().includes('3y');
  const is3yPlusBucket = (bucket: string) => bucket.includes('3') || bucket.toLowerCase().includes('3y');
  const oldStock2yPlusAmt = yearStockRows.filter((row) => is2yPlusBucket(row.bucket)).reduce((sum, row) => sum + row.currStockAmt, 0);
  const oldStock3yPlusAmt = yearStockRows.filter((row) => is3yPlusBucket(row.bucket)).reduce((sum, row) => sum + row.currStockAmt, 0);
  const oldStock2yPlusShare = totalYearStockAmt > 0 ? (oldStock2yPlusAmt / totalYearStockAmt) * 100 : null;
  const oldStock3yPlusShare = totalYearStockAmt > 0 ? (oldStock3yPlusAmt / totalYearStockAmt) * 100 : null;
  const bucketKeys = ['1년차', '2년차', '3년차 이상'] as const;
  const totalBucketCurrentSales = bucketKeys.reduce((sum, key) => sum + getBucketSeasonSalesMetric(key, 'periodTag', 0), 0);
  const totalBucketPrevSales = bucketKeys.reduce((sum, key) => sum + getBucketSeasonSalesMetric(key, 'periodTag', 1), 0);
  const totalBucketCurrentActSales = bucketKeys.reduce((sum, key) => sum + getBucketSeasonSalesMetric(key, 'periodAct', 0), 0);
  const totalBucketPrevActSales = bucketKeys.reduce((sum, key) => sum + getBucketSeasonSalesMetric(key, 'periodAct', 1), 0);
  const monthCode = getSection3MonthCode(date);
  const targetCategoryKey: Section3TargetCategory = categoryFilter === 'clothes' ? 'wear' : 'all';
  const monthlyTarget = region === 'HKMC' ? getSection3Target(monthCode, 'monthly', targetCategoryKey) : null;
  const cumulativeTarget = region === 'HKMC' ? getSection3Target(monthCode, 'cumulative', targetCategoryKey) : null;
  const currentDateObj = parseDateAtLocalMidnight(date);
  const elapsedDays = currentDateObj.getDate();
  const daysInMonth = new Date(currentDateObj.getFullYear(), currentDateObj.getMonth() + 1, 0).getDate();
  const projectedMonthlySoldAmt =
    elapsedDays > 0 ? (resolvedCurrentMonthTagSales / elapsedDays) * daysInMonth : null;
  const projectedCumulativeSoldAmt =
    projectedMonthlySoldAmt !== null
      ? resolvedPeriodTagSales - resolvedCurrentMonthTagSales + projectedMonthlySoldAmt
      : null;
  const buildProgressPct = (actual: number, target: number | null | undefined) =>
    target && target > 0 ? (actual / target) * 100 : null;
  const targetInfo =
    region === 'HKMC'
      ? {
          available: !!(monthlyTarget || cumulativeTarget),
          scope: 'HKMC_ONLY' as const,
          month_code: monthCode,
          category_key: targetCategoryKey,
          monthly: {
            target_sold_amt: monthlyTarget?.target_sold_amt ?? null,
            target_sold_gross: monthlyTarget?.target_sold_gross ?? null,
            target_discount_rate: monthlyTarget?.target_discount_rate ?? null,
            actual_sold_amt: resolvedCurrentMonthTagSales,
            actual_sold_gross: resolvedCurrentMonthActSales,
            actual_discount_rate: resolvedCurrentMonthDiscountRate,
            // Progress must compare TAG sales actual vs TAG sales target.
            progress_pct: buildProgressPct(resolvedCurrentMonthTagSales, monthlyTarget?.target_sold_gross),
            projected_sold_amt: projectedMonthlySoldAmt,
            projected_progress_pct: buildProgressPct(projectedMonthlySoldAmt ?? 0, monthlyTarget?.target_sold_gross),
          },
          cumulative: {
            target_sold_amt: cumulativeTarget?.target_sold_amt ?? null,
            target_sold_gross: cumulativeTarget?.target_sold_gross ?? null,
            target_discount_rate: cumulativeTarget?.target_discount_rate ?? null,
            actual_sold_amt: resolvedPeriodTagSales,
            actual_sold_gross: resolvedPeriodActSales,
            actual_discount_rate:
              resolvedPeriodTagSales > 0 ? 1 - resolvedPeriodActSales / resolvedPeriodTagSales : null,
            progress_pct: buildProgressPct(resolvedPeriodTagSales, cumulativeTarget?.target_sold_gross),
            projected_sold_amt: projectedCumulativeSoldAmt,
            projected_progress_pct: buildProgressPct(projectedCumulativeSoldAmt ?? 0, cumulativeTarget?.target_sold_gross),
          },
        }
      : null;

  const response: Section3Response = {
    asof_date: date,
    base_stock_date: baseStockDate,
    period_start_date: periodStartDate,
    season_type: seasonType,
    region,
    brand,
    header: header ? {
      year_bucket: header.YEAR_BUCKET,
      base_stock_amt: applyExchangeRate(parseFloat(header.BASE_STOCK_AMT || 0)) || 0,
      curr_stock_amt: applyExchangeRate(parseFloat(header.CURR_STOCK_AMT || 0)) || 0,
      ly_curr_stock_amt: null,
      curr_stock_yoy_pct: null,
      prev_month_curr_stock_amt: applyExchangeRate(parseFloat(header.PREV_CURR_STOCK_AMT || 0)) || 0,
      curr_stock_change: (applyExchangeRate(parseFloat(header.PREV_CURR_STOCK_AMT || 0)) || 0) - (applyExchangeRate(parseFloat(header.CURR_STOCK_AMT || 0)) || 0),
      stagnant_stock_amt: applyExchangeRate(parseFloat(header.STAGNANT_STOCK_AMT || 0)) || 0,
      prev_month_stagnant_stock_amt: applyExchangeRate(parseFloat(header.PREV_STAGNANT_STOCK_AMT || 0)) || 0,
      stagnant_ratio: (applyExchangeRate(parseFloat(header.CURR_STOCK_AMT || 0)) || 0) > 0
        ? (applyExchangeRate(parseFloat(header.STAGNANT_STOCK_AMT || 0)) || 0) / (applyExchangeRate(parseFloat(header.CURR_STOCK_AMT || 0)) || 0)
        : 0,
      prev_month_stagnant_ratio: (applyExchangeRate(parseFloat(header.PREV_CURR_STOCK_AMT || 0)) || 0) > 0
        ? (applyExchangeRate(parseFloat(header.PREV_STAGNANT_STOCK_AMT || 0)) || 0) / (applyExchangeRate(parseFloat(header.PREV_CURR_STOCK_AMT || 0)) || 0)
        : 0,
      depleted_stock_amt: applyExchangeRate(parseFloat(header.DEPLETED_STOCK_AMT || 0)) || 0,
      period_tag_sales: totalBucketCurrentSales,
      period_tag_sales_ly: totalBucketPrevSales,
      period_act_sales: totalBucketCurrentActSales,
      period_act_sales_ly: totalBucketPrevActSales,
      current_month_depleted: resolvedCurrentMonthTagSales,
      current_month_depleted_act: resolvedCurrentMonthActSales,
      current_month_depleted_ly: alignedCurrentMonthTagSalesLy,
      current_month_discount_rate: resolvedCurrentMonthDiscountRate,
      discount_rate:
        totalBucketCurrentSales > 0
          ? 1 - totalBucketCurrentActSales / totalBucketCurrentSales
          : parseFloat(header.DISCOUNT_RATE || 0),
      inv_days_raw: header.INV_DAYS_RAW ? parseFloat(header.INV_DAYS_RAW) : null,
      inv_days: header.INV_DAYS ? parseFloat(header.INV_DAYS) : null,
      old_stock_2y_plus_share: oldStock2yPlusShare,
      old_stock_3y_plus_share: oldStock3yPlusShare,
      target_info: targetInfo,
    } : null,
    years: lightweight ? [] : yearRows.map((row: any) => ({
      year_bucket: row.YEAR_BUCKET,
      season_code: getYearBucketSeasonCode(row.YEAR_BUCKET),
      sesn: row.SESN,
      base_stock_amt: applyExchangeRate(parseFloat(row.BASE_STOCK_AMT || 0)) || 0,
      curr_stock_amt: applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0,
      stagnant_stock_amt: applyExchangeRate(parseFloat(row.STAGNANT_STOCK_AMT || 0)) || 0,
      depleted_stock_amt: applyExchangeRate(parseFloat(row.DEPLETED_STOCK_AMT || 0)) || 0,
      period_tag_sales: applyExchangeRate(parseFloat(row.PERIOD_TAG_SALES || 0)) || 0,
      period_act_sales: applyExchangeRate(parseFloat(row.PERIOD_ACT_SALES || 0)) || 0,
      current_month_depleted: 0,
      discount_rate: parseFloat(row.DISCOUNT_RATE || 0),
      inv_days_raw: row.INV_DAYS_RAW ? parseFloat(row.INV_DAYS_RAW) : null,
      inv_days: row.INV_DAYS ? parseFloat(row.INV_DAYS) : null,
      is_over_1y: row.IS_OVER_1Y === 1,
    })),
    categories: lightweight ? [] : catRows.map((row: any) => ({
      year_bucket: row.YEAR_BUCKET,
      cat2: row.CAT2,
      base_stock_amt: applyExchangeRate(parseFloat(row.BASE_STOCK_AMT || 0)) || 0,
      curr_stock_amt: applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0,
      stagnant_stock_amt: applyExchangeRate(parseFloat(row.STAGNANT_STOCK_AMT || 0)) || 0,
      depleted_stock_amt: applyExchangeRate(parseFloat(row.DEPLETED_STOCK_AMT || 0)) || 0,
      discount_rate: parseFloat(row.DISCOUNT_RATE || 0),
      inv_days_raw: row.INV_DAYS_RAW ? parseFloat(row.INV_DAYS_RAW) : null,
      inv_days: row.INV_DAYS ? parseFloat(row.INV_DAYS) : null,
      is_over_1y: row.IS_OVER_1Y === 1,
    })),
    skus: lightweight ? [] : visibleSkuRows.map((row: any) => ({
      year_bucket: row.YEAR_BUCKET,
      sesn: row.SESN,
      cat2: row.CAT2,
      prdt_cd: row.PRDT_CD,
      base_stock_amt: applyExchangeRate(parseFloat(row.BASE_STOCK_AMT || 0)) || 0,
      curr_stock_amt: applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0,
      stagnant_stock_amt: applyExchangeRate(parseFloat(row.STAGNANT_STOCK_AMT || 0)) || 0,
      depleted_stock_amt: applyExchangeRate(parseFloat(row.DEPLETED_STOCK_AMT || 0)) || 0,
      period_tag_sales: applyExchangeRate(parseFloat(row.PERIOD_TAG_SALES || 0)) || 0,
      period_act_sales: applyExchangeRate(parseFloat(row.PERIOD_ACT_SALES || 0)) || 0,
    })),
  };

  const bucketTargetsByMode =
    region === 'HKMC'
      ? {
          monthly: getSection3YearBucketTargets(date, targetCategoryKey, 'monthly'),
          cumulative: getSection3YearBucketTargets(date, targetCategoryKey, 'cumulative'),
        }
      : null;
  const heatmapBucketTargets =
    region === 'HKMC'
      ? {
          wear: getSection3YearBucketTargets(date, 'wear', 'monthly'),
          accessory: getSection3YearBucketTargets(date, 'accessory', 'monthly'),
          all: getSection3YearBucketTargets(date, 'all', 'monthly'),
        }
      : null;

  response.summary_cards = {
    year_cards: yearRows.map((row: any) => {
      const bucket = String(row.YEAR_BUCKET || '');
      const seasonCode = getYearBucketSeasonCode(bucket);
      const bucketSales = bucketCurrentMonthSalesMap.get(bucket) ?? { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 };
      const currentTagSales = bucketSales.periodTag;
      const currentActSales = bucketSales.periodAct;
      const currentDiscountRate = currentTagSales > 0 ? 1 - currentActSales / currentTagSales : null;
      const currentMonthTagSales = bucketSales.monthTag;
      const currentMonthActSales = bucketSales.monthAct;
      const currentMonthDiscountRate =
        currentMonthTagSales > 0 ? 1 - currentMonthActSales / currentMonthTagSales : null;

      const currentBucketSalesForYoy = getBucketSeasonSalesMetric(bucket, 'periodTag', 0);
      const prevBucketSalesForYoy = getBucketSeasonSalesMetric(bucket, 'periodTag', 1);
      const salesYoyPct =
        prevBucketSalesForYoy > 0 ? (currentBucketSalesForYoy / prevBucketSalesForYoy) * 100 : null;

      const buildBucketTarget = (mode: 'monthly' | 'cumulative') => {
        const target = bucketTargetsByMode?.[mode]?.[bucket];
        if (!target) {
          return {
            progress_pct: null,
            projected_progress_pct: null,
            actual_discount_rate: mode === 'monthly'
              ? (resolvedCurrentMonthDiscountRate !== null ? resolvedCurrentMonthDiscountRate / 100 : null)
              : currentDiscountRate,
            target_discount_rate: null,
          };
        }

        if (mode === 'monthly') {
          const projectedMonth = elapsedDays > 0 ? (currentMonthTagSales / elapsedDays) * daysInMonth : null;
          return {
            progress_pct: buildProgressPct(currentMonthTagSales, target.target_sold_gross),
            projected_progress_pct: buildProgressPct(projectedMonth ?? 0, target.target_sold_gross),
            actual_discount_rate: currentMonthDiscountRate,
            target_discount_rate: target.target_discount_rate,
          };
        }

        const projectedMonth = elapsedDays > 0 ? (currentMonthTagSales / elapsedDays) * daysInMonth : null;
        const projectedCumulative = projectedMonth !== null ? currentTagSales - currentMonthTagSales + projectedMonth : null;
        return {
          progress_pct: buildProgressPct(currentTagSales, target.target_sold_gross),
          projected_progress_pct: buildProgressPct(projectedCumulative ?? 0, target.target_sold_gross),
          actual_discount_rate: currentDiscountRate,
          target_discount_rate: target.target_discount_rate,
        };
      };

      return {
        year_bucket: bucket,
        season_code: seasonCode,
        curr_stock_amt: applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0,
        stagnant_stock_amt: applyExchangeRate(parseFloat(row.STAGNANT_STOCK_AMT || 0)) || 0,
        period_tag_sales: currentTagSales,
        current_month_depleted: currentMonthTagSales,
        sales_yoy_pct: salesYoyPct,
        discount_rate: parseFloat(row.DISCOUNT_RATE || 0),
        target_info: region === 'HKMC'
          ? {
              monthly: buildBucketTarget('monthly'),
              cumulative: buildBucketTarget('cumulative'),
            }
          : null,
      };
    }),
    stagnant_card: response.header
      ? {
          stagnant_stock_amt: response.header.stagnant_stock_amt,
          stagnant_ratio: response.header.stagnant_ratio,
          prev_month_stagnant_ratio: response.header.prev_month_stagnant_ratio,
          curr_stock_amt: response.header.curr_stock_amt,
          inv_days: response.header.inv_days,
        }
      : null,
  };

  response.target_heatmap =
    region === 'HKMC'
      ? {
          mode: 'monthly',
          rows: ['1년차', '2년차', '3년차 이상'].map((bucket) => {
            const sales = bucketCategorySales.get(bucket) ?? {
              wear: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 },
              accessory: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 },
              all: { periodTag: 0, periodAct: 0, monthTag: 0, monthAct: 0 },
            };
            const buildCell = (categoryKey: 'wear' | 'accessory' | 'all', label: string) => {
              const target = heatmapBucketTargets?.[categoryKey]?.[bucket] ?? null;
              const targetWindow = bucketTargetWindows?.[categoryKey]?.[bucket] ?? null;
              const actual = sales[categoryKey];
              const projectedActual = elapsedDays > 0 ? (actual.monthTag / elapsedDays) * daysInMonth : null;
              const actualDiscountRate = actual.monthTag > 0 ? 1 - actual.monthAct / actual.monthTag : null;
              const targetDiscountRate = target?.target_discount_rate ?? null;
              const yearEndStock = bucketYearEndStockMap.get(bucket)?.[categoryKey] ?? 0;
              const ytdActualSales = bucketYtdActualSalesMap.get(bucket)?.[categoryKey] ?? 0;
              const yearEndTargetStock =
                targetWindow !== null ? yearEndStock - (targetWindow.annual_target_sold_gross ?? 0) : null;
              const rollingYearEndStock =
                targetWindow !== null ? yearEndStock - (ytdActualSales + (targetWindow.remaining_target_sold_gross ?? 0)) : null;
              return {
                category_key: categoryKey,
                label,
                available: !!target,
                completed: !target && actual.monthTag <= 0,
                actual_sold_amt: actual.monthTag,
                target_sold_gross: target?.target_sold_gross ?? null,
                progress_pct: buildProgressPct(actual.monthTag, target?.target_sold_gross),
                projected_progress_pct: buildProgressPct(projectedActual ?? 0, target?.target_sold_gross),
                actual_discount_rate: actualDiscountRate,
                target_discount_rate: targetDiscountRate,
                discount_delta_pct:
                  actualDiscountRate !== null && targetDiscountRate !== null
                    ? (actualDiscountRate - targetDiscountRate) * 100
                    : null,
                year_end_target_stock: yearEndTargetStock,
                rolling_year_end_stock: rollingYearEndStock,
                rolling_year_end_gap:
                  yearEndTargetStock !== null && rollingYearEndStock !== null
                    ? rollingYearEndStock - yearEndTargetStock
                    : null,
              };
            };
            return {
              year_bucket: bucket,
              cells: [
                buildCell('wear', '의류'),
                buildCell('accessory', '악세'),
                buildCell('all', '전체'),
              ],
            };
          }),
        }
      : null;

  if (includeYoY && response.header) {
    try {
      const lyDateObj = new Date(`${date}T00:00:00`);
      lyDateObj.setFullYear(lyDateObj.getFullYear() - 1);
      const lyDate = formatDateYYYYMMDD(lyDateObj);

      let lyCurrStockRaw = await fetchPreviousYearCurrentStock(lyDate, categoryFilter);
      if (region === 'TW') {
        const lyPeriod = getPeriodFromDateString(lyDate);
        lyCurrStockRaw = convertTwdToHkd(lyCurrStockRaw, lyPeriod) || 0;
      }

      response.header.ly_curr_stock_amt = lyCurrStockRaw;
      response.header.curr_stock_yoy_pct =
        lyCurrStockRaw > 0
          ? Math.round((response.header.curr_stock_amt / lyCurrStockRaw) * 10000) / 100
          : 0;
    } catch (error: any) {
      console.error('[section3] failed to compute current stock YoY:', error.message);
      response.header.ly_curr_stock_amt = 0;
      response.header.curr_stock_yoy_pct = 0;
    }
  }

  async function fetchPreviousYearCurrentStock(
    asofDate: string,
    yoyCategoryFilter: 'clothes' | 'all'
  ): Promise<number> {
    const { seasonType, maxSeasonYY } = getPastSameTypeSeasonCutoff(asofDate);

    if (asofDate < '2025-09-22') {
      return fetchLegacyCurrStockFromPrep(asofDate, yoyCategoryFilter, seasonType, maxSeasonYY);
    }

    const storeCodes = allStores.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
    const stockCategoryClause =
      yoyCategoryFilter === 'clothes'
        ? `AND SUBSTR(s.PRDT_CD, 7, 2) IN (${apparelCategoryList})`
        : '';

    const currentQuery = `
WITH latest_stock_date AS (
  SELECT MAX(STOCK_DT) AS stock_dt
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
  WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (${storeCodes})
    AND STOCK_DT <= DATEADD(DAY, 1, TO_DATE(?))
)
SELECT COALESCE(SUM(s.TAG_STOCK_AMT), 0) AS curr_stock_amt
FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
CROSS JOIN latest_stock_date l
WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
  AND s.LOCAL_SHOP_CD IN (${storeCodes})
  AND s.STOCK_DT = l.stock_dt
  AND RIGHT(s.SESN, 1) = ?
  AND TRY_TO_NUMBER(LEFT(s.SESN, 2)) <= ?
  ${stockCategoryClause}
`;
    const rows = await executeSnowflakeQuery(currentQuery, [
      normalizedBrand,
      asofDate,
      normalizedBrand,
      seasonType,
      maxSeasonYY,
    ]);
    return parseFloat(rows?.[0]?.CURR_STOCK_AMT || 0);
  }

  function getPastSameTypeSeasonCutoff(asofDate: string): { seasonType: 'S' | 'F'; maxSeasonYY: number } {
    const d = new Date(`${asofDate}T00:00:00`);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const seasonType: 'S' | 'F' = month >= 9 || month <= 2 ? 'F' : 'S';
    const seasonYY = month >= 9 ? year % 100 : month <= 2 ? (year - 1) % 100 : year % 100;
    return { seasonType, maxSeasonYY: seasonYY - 1 };
  }

  async function fetchLegacyCurrStockFromPrep(
    asofDate: string,
    legacyCategoryFilter: 'clothes' | 'all',
    seasonType: 'S' | 'F',
    maxSeasonYY: number
  ): Promise<number> {
    const yyyymm = asofDate.slice(0, 7).replace('-', '');

    const storeCodes = allStores.map((code) => `'${code}'`).join(',');
    const legacyCategoryClause =
      legacyCategoryFilter === 'clothes'
        ? `AND s.SUB_CTGR IN (${apparelCategoryList})`
        : '';
    const legacyQuery = `
WITH latest_month AS (
  SELECT MAX(YYYYMM) AS yyyymm
  FROM SAP_FNF.PREP_HMD_STOCK
  WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (${storeCodes})
    AND TO_NUMBER(YYYYMM) <= TO_NUMBER(?)
)
SELECT COALESCE(SUM(TAG_STOCK_AMT), 0) AS curr_stock_amt
FROM SAP_FNF.PREP_HMD_STOCK s
CROSS JOIN latest_month m
WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
  AND s.LOCAL_SHOP_CD IN (${storeCodes})
  AND s.YYYYMM = m.yyyymm
  AND RIGHT(s.SESN, 1) = ?
  AND TRY_TO_NUMBER(LEFT(s.SESN, 2)) <= ?
  ${legacyCategoryClause}
`;
    const legacyRows = await executeSnowflakeQuery(legacyQuery, [
      normalizedBrand,
      yyyymm,
      normalizedBrand,
      seasonType,
      maxSeasonYY,
    ]);
    return parseFloat(legacyRows?.[0]?.CURR_STOCK_AMT || 0);
  }

  type InventorySegmentKey =
    | 'current_s'
    | 'current_f'
    | 'past_s'
    | 'past_f'
    | 'hat'
    | 'shoes'
    | 'bag'
    | 'acc';

  const inventorySegmentOrder: InventorySegmentKey[] = [
    'current_s',
    'current_f',
    'past_s',
    'past_f',
    'hat',
    'shoes',
    'bag',
    'acc',
  ];

  const inventorySegmentLabels: Record<InventorySegmentKey, string> = {
    current_s: '당시즌S',
    current_f: '당시즌F',
    past_s: '과시즌S',
    past_f: '과시즌F',
    hat: '모자',
    shoes: '신발',
    bag: '가방',
    acc: '기타악세',
  };

  const buildInventorySegmentCards = async (currentDate: string, previousDate: string) => {
    const [currentRows, previousRows] = await Promise.all([
      fetchInventorySegmentRows(currentDate),
      fetchInventorySegmentRows(previousDate),
    ]);

    const currentAmounts = aggregateInventorySegmentAmounts(currentRows, currentDate);
    const previousAmounts = aggregateInventorySegmentAmounts(previousRows, previousDate);
    const currentOldSeasonApparelAmt = skuRows
      .filter((row: any) => {
        const cat2 = String(row.CAT2 || '').trim().toUpperCase();
        const mapping = getCategoryMapping(cat2);
        return ['OUTER', 'INNER', 'BOTTOM', 'Wear_etc'].includes(mapping.middle);
      })
      .reduce((sum: number, row: any) => sum + (applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0), 0);
    let previousOldSeasonApparelAmt = await fetchPreviousYearCurrentStock(previousDate, 'clothes');
    if (region === 'TW') {
      previousOldSeasonApparelAmt = convertTwdToHkd(previousOldSeasonApparelAmt, getPeriodFromDateString(previousDate)) || 0;
    }
    const pastSeasonKey: InventorySegmentKey = String(seasonType || '').toUpperCase().includes('SS') ? 'past_s' : 'past_f';
    currentAmounts[pastSeasonKey] = currentOldSeasonApparelAmt;
    previousAmounts[pastSeasonKey] = previousOldSeasonApparelAmt;

    return inventorySegmentOrder.map((key) => {
      const curr = currentAmounts[key] || 0;
      const ly = previousAmounts[key] || 0;
      return {
        key,
        label: inventorySegmentLabels[key],
        curr_stock_amt: curr,
        ly_curr_stock_amt: ly > 0 ? ly : null,
        yoy_pct: ly > 0 ? Math.round((curr / ly) * 10000) / 100 : null,
      };
    });
  };

  const getSeasonThresholds = (targetDate: string) => {
    const d = new Date(`${targetDate}T00:00:00`);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const currentSYear = month >= 9 ? (year + 1) % 100 : year % 100;
    const currentFYear = month <= 2 ? (year - 1) % 100 : year % 100;
    return { currentSYear, currentFYear };
  };

  const emptyInventorySegments = (): Record<InventorySegmentKey, number> => ({
    current_s: 0,
    current_f: 0,
    past_s: 0,
    past_f: 0,
    hat: 0,
    shoes: 0,
    bag: 0,
    acc: 0,
  });

  const aggregateInventorySegmentAmounts = (rows: any[], targetDate: string) => {
    const totals = emptyInventorySegments();
    const { currentSYear, currentFYear } = getSeasonThresholds(targetDate);
    const apparelMiddles = new Set(['OUTER', 'INNER', 'BOTTOM', 'Wear_etc']);
    const applyRateForDate = (amount: number) => {
      if (region !== 'TW') return amount;
      return convertTwdToHkd(amount, getPeriodFromDateString(targetDate)) || 0;
    };

    for (const row of rows) {
      const sesn = String(row.SESN || '').trim().toUpperCase();
      const cat2 = String(row.CAT2 || '').trim().toUpperCase();
      const amount = applyRateForDate(parseFloat(row.CURR_STOCK_AMT || 0) || 0);
      if (!amount) continue;

      const mapping = getCategoryMapping(cat2);
      if (mapping.middle === 'Headwear') {
        totals.hat += amount;
        continue;
      }
      if (mapping.middle === 'Shoes') {
        totals.shoes += amount;
        continue;
      }
      if (mapping.middle === 'BAG') {
        totals.bag += amount;
        continue;
      }
      if (mapping.large === '기타ACC') {
        totals.acc += amount;
        continue;
      }
      if (!apparelMiddles.has(mapping.middle)) {
        continue;
      }

      const match = sesn.match(/^(\d{2})([FS])$/);
      if (!match) continue;
      const seasonYY = Number(match[1]);
      const seasonType = match[2] as 'S' | 'F';

      if (seasonType === 'S') {
        if (seasonYY >= currentSYear) totals.current_s += amount;
        else totals.past_s += amount;
      } else {
        if (seasonYY >= currentFYear) totals.current_f += amount;
        else totals.past_f += amount;
      }
    }

    return totals;
  };

  const fetchInventorySegmentRows = async (targetDate: string): Promise<any[]> => {
    if (targetDate < '2025-09-22') {
      return fetchLegacyInventorySegmentRows(targetDate);
    }

    const escapedStoreCodes = allStores.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
    const currentQuery = `
WITH latest_stock_date AS (
  SELECT MAX(STOCK_DT) AS stock_dt
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
  WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (${escapedStoreCodes})
    AND STOCK_DT <= DATEADD(DAY, 1, TO_DATE(?))
)
SELECT
  s.SESN,
  SUBSTR(s.PRDT_CD, 7, 2) AS CAT2,
  COALESCE(SUM(s.TAG_STOCK_AMT), 0) AS CURR_STOCK_AMT
FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
CROSS JOIN latest_stock_date l
WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
  AND s.LOCAL_SHOP_CD IN (${escapedStoreCodes})
  AND s.STOCK_DT = l.stock_dt
GROUP BY s.SESN, SUBSTR(s.PRDT_CD, 7, 2)
`;

    return executeSnowflakeQuery(currentQuery, [normalizedBrand, targetDate, normalizedBrand]);
  };

  const fetchLegacyInventorySegmentRows = async (targetDate: string): Promise<any[]> => {
    const yyyymm = targetDate.slice(0, 7).replace('-', '');
    const escapedStoreCodes = allStores.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
    const legacyQuery = `
WITH latest_month AS (
  SELECT MAX(YYYYMM) AS yyyymm
  FROM SAP_FNF.PREP_HMD_STOCK
  WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (${escapedStoreCodes})
    AND TO_NUMBER(YYYYMM) <= TO_NUMBER(?)
)
SELECT
  s.SESN,
  s.SUB_CTGR AS CAT2,
  COALESCE(SUM(s.TAG_STOCK_AMT), 0) AS CURR_STOCK_AMT
FROM SAP_FNF.PREP_HMD_STOCK s
CROSS JOIN latest_month m
WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = ?
  AND s.LOCAL_SHOP_CD IN (${escapedStoreCodes})
  AND s.YYYYMM = m.yyyymm
GROUP BY s.SESN, s.SUB_CTGR
`;

    return executeSnowflakeQuery(legacyQuery, [normalizedBrand, yyyymm, normalizedBrand]);
  };

  try {
    const lyDateObj = new Date(`${date}T00:00:00`);
    lyDateObj.setFullYear(lyDateObj.getFullYear() - 1);
    const lyDate = formatDateYYYYMMDD(lyDateObj);
    response.inventory_segment_cards = await buildInventorySegmentCards(date, lyDate);
  } catch (error: any) {
    console.error('[section3] failed to build inventory segment cards:', error.message);
    response.inventory_segment_cards = [];
  }

  return response;
}


