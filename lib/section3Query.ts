import { executeSnowflakeQuery } from '@/lib/snowflake';
import { normalizeBrand, getAllStoresByRegionBrand, getStoresByRegionBrandChannel } from '@/lib/store-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';
import { formatDateYYYYMMDD } from '@/lib/date-utils';
import { getApparelCategories } from '@/lib/category-utils.server';

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
    discount_rate: number;
    inv_days_raw: number | null;
    inv_days: number | null;
    old_stock_2y_plus_share: number | null;
    old_stock_3y_plus_share: number | null;
  } | null;
  years: Array<{
    year_bucket: string;
    season_code: string;
    sesn: string;
    base_stock_amt: number;
    curr_stock_amt: number;
    stagnant_stock_amt: number;
    depleted_stock_amt: number;
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
  const apparelCategoryList = getApparelCategories()
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
      COALESCE(SUM(CASE WHEN S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN S.TAG_SALE_AMT ELSE 0 END), 0) AS current_month_tag_sales_total
    FROM SAP_FNF.DW_HMD_SALE_D S
    WHERE ${brandFilter}
      AND S.LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      ${salesCategoryFilter}
      AND RIGHT(S.SESN, 1) IN ('S', 'F')
      AND (
        CASE
          WHEN RIGHT(S.SESN, 1) = 'S' THEN TRY_TO_NUMBER(LEFT(S.SESN, 2)) * 2
          ELSE TRY_TO_NUMBER(LEFT(S.SESN, 2)) * 2 + 1
        END
      ) <= ?
      AND S.SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
  `;
  const alignedSalesRowsPromise = executeSnowflakeQuery(alignedSalesQuery, [
    periodStartForSales,
    date,
    periodStartForSales,
    date,
    currentMonthStartForSales,
    date,
    pastCutoffIndexForSales,
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
    pastCutoffIndexForSalesLy,
    periodStartForSalesLy,
    lyDateForSales,
  ]);

  const [rows, alignedSalesRows, alignedSalesLyRows] = await Promise.all([
    rowsPromise,
    alignedSalesRowsPromise,
    alignedSalesLyRowsPromise,
  ]);
  console.log(`??Section3Query - Result: ${rows.length} rows`);

  const alignedPeriodTagSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.PERIOD_TAG_SALES_TOTAL || 0)) || 0;
  const alignedPeriodActSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.PERIOD_ACT_SALES_TOTAL || 0)) || 0;
  const alignedCurrentMonthTagSales =
    applyExchangeRate(parseFloat(alignedSalesRows?.[0]?.CURRENT_MONTH_TAG_SALES_TOTAL || 0)) || 0;
  const alignedPeriodTagSalesLy =
    applyExchangeRateLY(parseFloat(alignedSalesLyRows?.[0]?.PERIOD_TAG_SALES_TOTAL || 0)) || 0;
  const alignedPeriodActSalesLy =
    applyExchangeRateLY(parseFloat(alignedSalesLyRows?.[0]?.PERIOD_ACT_SALES_TOTAL || 0)) || 0;

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
  const asofDate = new Date(date);
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
      period_tag_sales: resolvedPeriodTagSales,
      period_tag_sales_ly: alignedPeriodTagSalesLy,
      period_act_sales: resolvedPeriodActSales,
      period_act_sales_ly: alignedPeriodActSalesLy,
      current_month_depleted: resolvedCurrentMonthTagSales,
      discount_rate:
        resolvedPeriodTagSales > 0
          ? 1 - resolvedPeriodActSales / resolvedPeriodTagSales
          : parseFloat(header.DISCOUNT_RATE || 0),
      inv_days_raw: header.INV_DAYS_RAW ? parseFloat(header.INV_DAYS_RAW) : null,
      inv_days: header.INV_DAYS ? parseFloat(header.INV_DAYS) : null,
      old_stock_2y_plus_share: oldStock2yPlusShare,
      old_stock_3y_plus_share: oldStock3yPlusShare,
    } : null,
    years: lightweight ? [] : yearRows.map((row: any) => ({
      year_bucket: row.YEAR_BUCKET,
      season_code: getYearBucketSeasonCode(row.YEAR_BUCKET),
      sesn: row.SESN,
      base_stock_amt: applyExchangeRate(parseFloat(row.BASE_STOCK_AMT || 0)) || 0,
      curr_stock_amt: applyExchangeRate(parseFloat(row.CURR_STOCK_AMT || 0)) || 0,
      stagnant_stock_amt: applyExchangeRate(parseFloat(row.STAGNANT_STOCK_AMT || 0)) || 0,
      depleted_stock_amt: applyExchangeRate(parseFloat(row.DEPLETED_STOCK_AMT || 0)) || 0,
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

  return response;
}


