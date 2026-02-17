import { executeSnowflakeQuery } from '@/lib/snowflake';
import { normalizeBrand, getAllStoresByRegionBrand } from '@/lib/store-utils';
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
    current_month_depleted: number;
    discount_rate: number;
    inv_days_raw: number | null;
    inv_days: number | null;
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
  options?: { includeYoY?: boolean; categoryFilter?: 'clothes' | 'all' }
): Promise<Section3Response> {
  const includeYoY = options?.includeYoY !== false;
  const categoryFilter = options?.categoryFilter === 'clothes' ? 'clothes' : 'all';
  const normalizedBrand = normalizeBrand(brand);
  
  // 釉뚮옖?쒕퀎 議곌굔
  const brandFilter = normalizedBrand === 'M' 
    ? "(CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'M'" 
    : "BRD_CD = 'X'";
  
  // 紐⑤뱺 留ㅼ옣 肄붾뱶 媛?몄삤湲?(region, brand 湲곕컲, warehouse ?ы븿)
  const allStores = getAllStoresByRegionBrand(region, brand);
  
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
      ? `AND SUBSTR(S.PRDT_CD, 7, 2) IN (${apparelCategoryList})`
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
    -- 湲곗큹?ш퀬???곗젙
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
        -- FW: YYYY-08-31
        CASE
          WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN
            CAST(YEAR(CAST(? AS DATE)) || '-08-31' AS DATE)
          ELSE
            CAST((YEAR(CAST(? AS DATE)) - 1) || '-08-31' AS DATE)
        END
      ELSE
        -- SS: YYYY-02-28 or 02-29 (leap year)
        CASE
          WHEN MOD(YEAR(CAST(? AS DATE)), 4) = 0 AND (MOD(YEAR(CAST(? AS DATE)), 100) != 0 OR MOD(YEAR(CAST(? AS DATE)), 400) = 0) THEN
            CAST(YEAR(CAST(? AS DATE)) || '-02-29' AS DATE)
          ELSE
            CAST(YEAR(CAST(? AS DATE)) || '-02-28' AS DATE)
        END
    END AS BASE_STOCK_DT,
    -- ?먮ℓ湲곌컙 ?쒖옉??
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
        -- FW: YYYY-09-01
        CASE
          WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN
            CAST(YEAR(CAST(? AS DATE)) || '-09-01' AS DATE)
          ELSE
            CAST((YEAR(CAST(? AS DATE)) - 1) || '-09-01' AS DATE)
        END
      ELSE
        -- SS: YYYY-03-01
        CAST(YEAR(CAST(? AS DATE)) || '-03-01' AS DATE)
    END AS PERIOD_START_DT,
    -- ?먮ℓ湲곌컙 ?쇱닔
    DATEDIFF(day,
      CASE
        WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
          CASE
            WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN
              CAST(YEAR(CAST(? AS DATE)) || '-09-01' AS DATE)
            ELSE
              CAST((YEAR(CAST(? AS DATE)) - 1) || '-09-01' AS DATE)
          END
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
    AND ST.STOCK_DT = BSD.EFFECTIVE_BASE_STOCK_DT
  GROUP BY ST.SESN, ST.PRDT_CD
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

CURR_STOCK_SNAP_RAW AS (
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
  GROUP BY ST.SESN, ST.PRDT_CD
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
    S.PRDT_CD,
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
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
),

MONTHLY_SALES AS (
  SELECT
    SB.YEAR_BUCKET,
    S.SESN,
    S.PRDT_CD,
    SUBSTR(S.PRDT_CD, 7, 2) AS CAT2,
    SUM(S.TAG_SALE_AMT) AS MONTHLY_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN DATEADD(day, -30, PA.ASOF_DATE) AND PA.ASOF_DATE
    ${shopFilter}
    ${salesCategoryFilter}
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
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
    ST.PRDT_CD,
    SUM(ST.TAG_STOCK_AMT) AS PREV_CURR_STOCK_AMT
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D ST
  CROSS JOIN PARAM PA
  CROSS JOIN PREV_MONTH_STOCK_DT_RESOLVED PMSD
  WHERE ${brandFilter}
    AND RIGHT(ST.SESN, 1) = PA.CUR_TYP
    ${shopFilter}
    ${stockCategoryFilter}
    AND ST.STOCK_DT = PMSD.EFFECTIVE_PREV_MONTH_STOCK_DT
  GROUP BY ST.SESN, ST.PRDT_CD
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
    S.PRDT_CD,
    SUM(S.TAG_SALE_AMT) AS PREV_MONTHLY_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN DATEADD(day, -30, PA.PREV_MONTH_END_DT) AND PA.PREV_MONTH_END_DT
    ${shopFilter}
    ${salesCategoryFilter}
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
),

CURRENT_MONTH_SALES AS (
  SELECT
    SB.YEAR_BUCKET,
    S.SESN,
    S.PRDT_CD,
    SUM(S.TAG_SALE_AMT) AS CURRENT_MONTH_TAG_SALES
  FROM SAP_FNF.DW_HMD_SALE_D S
  CROSS JOIN PARAM PA
  INNER JOIN SEASON_BUCKETS SB ON S.SESN = SB.SESN
  WHERE ${brandFilter}
    AND S.SALE_DT BETWEEN PA.CURRENT_MONTH_START_DT AND PA.ASOF_DATE
    ${shopFilter}
    ${salesCategoryFilter}
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
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
    COALESCE(CS.CURR_STOCK_AMT, 0) AS CURR_STOCK_AMT,
    CASE
      WHEN COALESCE(CS.CURR_STOCK_AMT, 0) > 0
        AND (
          COALESCE(MS.MONTHLY_TAG_SALES, 0) = 0
          OR COALESCE(MS.MONTHLY_TAG_SALES, 0) < (COALESCE(CS.CURR_STOCK_AMT, 0) * 0.001)
        )
      THEN COALESCE(CS.CURR_STOCK_AMT, 0)
      ELSE 0
    END AS STAGNANT_STOCK_AMT,
    COALESCE(PS.PERIOD_TAG_SALES, 0) AS DEPLETED_STOCK_AMT,
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
    OR COALESCE(CS.CURR_STOCK_AMT, 0) > 0
    OR COALESCE(PS.PERIOD_TAG_SALES, 0) > 0
    OR COALESCE(PS.PERIOD_ACT_SALES, 0) > 0
),

CAT_LEVEL AS (
  SELECT
    2 AS SORT_LEVEL,
    'CAT' AS ROW_LEVEL,
    YEAR_BUCKET,
    NULL AS SESN,
    CAT2,
    NULL AS PRDT_CD,
    SUM(BASE_STOCK_AMT) AS BASE_STOCK_AMT,
    SUM(CURR_STOCK_AMT) AS CURR_STOCK_AMT,
    SUM(STAGNANT_STOCK_AMT) AS STAGNANT_STOCK_AMT,
    SUM(PERIOD_TAG_SALES) AS DEPLETED_STOCK_AMT,
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
  WHERE CAT2 IS NOT NULL
  GROUP BY YEAR_BUCKET, CAT2
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
    SUM(PERIOD_TAG_SALES) AS DEPLETED_STOCK_AMT,
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
    SUM(PERIOD_TAG_SALES) AS DEPLETED_STOCK_AMT,
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
  const rows = await executeSnowflakeQuery(query, params);
  
  console.log(`??Section3Query - Result: ${rows.length} rows`);

  // TW 由ъ쟾?????섏쑉 ?곸슜
  const isTwRegion = region === 'TW';
  const period = isTwRegion ? getPeriodFromDateString(date) : '';
  
  const applyExchangeRate = (amount: number | null): number | null => {
    if (amount === null) return null;
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, period);
  };

  // ?덈꺼蹂??곗씠??遺꾨━
  const header = rows.find((r: any) => r.ROW_LEVEL === 'HEADER');
  const yearRows = rows.filter((r: any) => r.ROW_LEVEL === 'YEAR');
  const catRows = rows.filter((r: any) => r.ROW_LEVEL === 'CAT');
  const skuRows = rows.filter((r: any) => r.ROW_LEVEL === 'SKU');

  // ?좎쭨 怨꾩궛 (?꾨줎???쒖떆??
  const asofDate = new Date(date);
  const month = asofDate.getMonth() + 1;
  const year = asofDate.getFullYear();
  
  let baseStockDate: string;
  let periodStartDate: string;
  let seasonType: string;
  let currentYY: number;
  
  if (month >= 9 || month <= 2) {
    const fwYear = month >= 9 ? year : year - 1;
    baseStockDate = `${fwYear}-08-31`;
    periodStartDate = `${fwYear}-09-01`;
    seasonType = 'FW';
    currentYY = month >= 9 ? year % 100 : (year - 1) % 100;
  } else {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    baseStockDate = `${year}-02-${isLeap ? '29' : '28'}`;
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
      current_month_depleted: applyExchangeRate(parseFloat(header.CURRENT_MONTH_DEPLETED_AMT || 0)) || 0,
      discount_rate: parseFloat(header.DISCOUNT_RATE || 0),
      inv_days_raw: header.INV_DAYS_RAW ? parseFloat(header.INV_DAYS_RAW) : null,
      inv_days: header.INV_DAYS ? parseFloat(header.INV_DAYS) : null,
    } : null,
    years: yearRows.map((row: any) => ({
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
    categories: catRows.map((row: any) => ({
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
    skus: skuRows.map((row: any) => ({
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
      const lyResponse = await executeSection3Query(region, brand, lyDate, {
        includeYoY: false,
        categoryFilter,
      });
      let lyCurrStock = lyResponse.header?.curr_stock_amt ?? 0;

      if (lyDate < '2025-10-01') {
        const legacyRaw = await fetchLegacyCurrStockFromPrep(lyDate, categoryFilter);
        if (legacyRaw > 0) {
          if (region === 'TW') {
            const lyPeriod = getPeriodFromDateString(lyDate);
            lyCurrStock = convertTwdToHkd(legacyRaw, lyPeriod) || 0;
          } else {
            lyCurrStock = legacyRaw;
          }
        }
      }

      response.header.ly_curr_stock_amt = lyCurrStock;
      response.header.curr_stock_yoy_pct =
        lyCurrStock > 0
          ? Math.round((response.header.curr_stock_amt / lyCurrStock) * 10000) / 100
          : 0;
    } catch (error: any) {
      console.error('[section3] failed to compute current stock YoY:', error.message);
      response.header.ly_curr_stock_amt = 0;
      response.header.curr_stock_yoy_pct = 0;
    }
  }
  async function fetchLegacyCurrStockFromPrep(
    asofDate: string,
    legacyCategoryFilter: 'clothes' | 'all'
  ): Promise<number> {
    const yyyymm = asofDate.slice(0, 7).replace('-', '');
    const d = new Date(`${asofDate}T00:00:00`);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const seasonType = month >= 9 || month <= 2 ? 'F' : 'S';
    const currentYY = month >= 9 ? year % 100 : month <= 2 ? (year - 1) % 100 : year % 100;
    const oldSeasonStartYY = currentYY - 1;

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
      oldSeasonStartYY,
    ]);
    return parseFloat(legacyRows?.[0]?.CURR_STOCK_AMT || 0);
  }

  return response;
}

