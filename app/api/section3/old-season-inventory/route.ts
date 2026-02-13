import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { normalizeBrand, getAllStoresByRegionBrand } from '@/lib/store-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section3/old-season-inventory
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * 변경사항: 4Q 블록 제거, 시즌 기초재고 대비 현재 현황 중심으로 재구성
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';

    console.log('🔍 API Section3 - Received params:', { region, brand, date });

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    const normalizedBrand = normalizeBrand(brand);
    
    // 브랜드별 조건
    const brandFilter = normalizedBrand === 'M' 
      ? "(CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'M'" 
      : "BRD_CD = 'X'";
    
    // 모든 매장 코드 가져오기 (region, brand 기반, warehouse 포함)
    const allStores = getAllStoresByRegionBrand(region, brand);
    
    if (allStores.length === 0) {
      return NextResponse.json({
        asof_date: date,
        base_stock_date: null,
        period_start_date: null,
        season_type: null,
        region,
        brand,
        header: null,
        years: [],
        categories: [],
        skus: [],
      });
    }
    
    // 매장 리스트 CTE 동적 생성
    const shopValues = allStores.map(code => `('${code}')`).join(',\n    ');
    const shopListCTE = `
region_shop AS (
  SELECT column1 AS local_shop_cd
  FROM VALUES
    ${shopValues}
),
`;
    
    const shopFilter = 'AND LOCAL_SHOP_CD IN (SELECT local_shop_cd FROM region_shop)';
    
    /*
     * 예시:
     * ASOF=2026-02-02 → FW: 기초=2025-08-31, 판매기간=2025-09-01~2026-02-02
     * ASOF=2026-03-15 → SS: 기초=2026-02-28, 판매기간=2026-03-01~2026-03-15
     */
    const query = `
WITH
${shopListCTE}
PARAM AS (
  SELECT
    CAST(? AS DATE) AS ASOF_DATE,
    -- 전월말 날짜
    LAST_DAY(DATEADD(MONTH, -1, CAST(? AS DATE))) AS PREV_MONTH_END_DT,
    -- 당월 1일
    DATE_TRUNC('MONTH', CAST(? AS DATE)) AS CURRENT_MONTH_START_DT,
    -- 현재 시즌 타입 판단 (9~2월=FW, 3~8월=SS)
    CASE WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN 'F' ELSE 'S' END AS CUR_TYP,
    -- 현재 시즌 연도(YY)
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN MOD(YEAR(CAST(? AS DATE)), 100)
      WHEN MONTH(CAST(? AS DATE)) IN (1,2) THEN MOD(YEAR(CAST(? AS DATE)) - 1, 100)
      ELSE MOD(YEAR(CAST(? AS DATE)), 100)
    END AS CUR_YY,
    -- 기초재고일 산정
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
        -- FW: YYYY-09-30 (임시: 9월20일부터 데이터 있음)
        CASE
          WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN
            CAST(YEAR(CAST(? AS DATE)) || '-09-30' AS DATE)
          ELSE
            CAST((YEAR(CAST(? AS DATE)) - 1) || '-09-30' AS DATE)
        END
      ELSE
        -- SS: YYYY-02-28 or 02-29 (윤년) [원래 로직 유지]
        CASE
          WHEN MOD(YEAR(CAST(? AS DATE)), 4) = 0 AND (MOD(YEAR(CAST(? AS DATE)), 100) != 0 OR MOD(YEAR(CAST(? AS DATE)), 400) = 0) THEN
            CAST(YEAR(CAST(? AS DATE)) || '-02-29' AS DATE)
          ELSE
            CAST(YEAR(CAST(? AS DATE)) || '-02-28' AS DATE)
        END
    END AS BASE_STOCK_DT,
    -- 판매기간 시작일
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
        -- FW: YYYY-10-01 (임시: 소진/할인/재고일수 모두 10월1일부터)
        CASE
          WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN
            CAST(YEAR(CAST(? AS DATE)) || '-10-01' AS DATE)
          ELSE
            CAST((YEAR(CAST(? AS DATE)) - 1) || '-10-01' AS DATE)
        END
      ELSE
        -- SS: YYYY-03-01 [원래 로직 유지]
        CAST(YEAR(CAST(? AS DATE)) || '-03-01' AS DATE)
    END AS PERIOD_START_DT,
    -- 판매기간 일수
    DATEDIFF(day,
      CASE
        WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN
          CASE
            WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN
              CAST(YEAR(CAST(? AS DATE)) || '-10-01' AS DATE)
            ELSE
              CAST((YEAR(CAST(? AS DATE)) - 1) || '-10-01' AS DATE)
          END
        ELSE
          CAST(YEAR(CAST(? AS DATE)) || '-03-01' AS DATE)
      END,
      CAST(? AS DATE)
    ) + 1 AS PERIOD_DAYS
),

-- 과시즌 버킷 정의 (기존 로직 유지)
SEASON_BUCKETS AS (
  SELECT DISTINCT
    s.SESN,
    CAST(LEFT(s.SESN, 2) AS INTEGER) AS SESN_YY,
    RIGHT(s.SESN, 1) AS SESN_TYP,
    PA.CUR_TYP,
    PA.CUR_YY,
    CASE
      -- FW 시즌 중: F 시즌만 연차별로 표시
      WHEN PA.CUR_TYP='F' AND RIGHT(s.SESN, 1)='F' THEN
        CASE
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = PA.CUR_YY-1 THEN '1년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = PA.CUR_YY-2 THEN '2년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) <= PA.CUR_YY-3 THEN '3년차 이상'
          ELSE NULL
        END
      -- SS 시즌 중: S 시즌만 연차별로 표시
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

-- 기초재고 날짜 결정 (fallback) - 이미 +1일 적용된 날짜 사용
BASE_STOCK_DT_RESOLVED AS (
  SELECT 
    PA.BASE_STOCK_DT,
    COALESCE(
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT = PA.BASE_STOCK_DT),
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT <= PA.BASE_STOCK_DT)
    ) AS EFFECTIVE_BASE_STOCK_DT
  FROM PARAM PA
),

-- 현재재고 날짜 결정 (fallback)
CURR_STOCK_DT_RESOLVED AS (
  SELECT 
    PA.ASOF_DATE,
    COALESCE(
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT = DATEADD(day, 1, PA.ASOF_DATE)),
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT <= DATEADD(day, 1, PA.ASOF_DATE))
    ) AS EFFECTIVE_CURR_STOCK_DT
  FROM PARAM PA
),

-- 기초재고 스냅샷 (fallback 적용) - 모든 F/S 시즌 먼저 수집
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
    AND ST.STOCK_DT = BSD.EFFECTIVE_BASE_STOCK_DT
  GROUP BY ST.SESN, ST.PRDT_CD
),

-- 기초재고에 연차 버킷 매핑
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

-- 현재재고 스냅샷 (fallback 적용) - 모든 F/S 시즌 먼저 수집
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
    AND ST.STOCK_DT = CSD.EFFECTIVE_CURR_STOCK_DT
  GROUP BY ST.SESN, ST.PRDT_CD
),

-- 현재재고에 연차 버킷 매핑
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

-- 기간 판매 (판매기간 시작~ASOF)
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
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
),

-- 최근 1개월 판매 (정체재고 판단용 - ASOF 기준 최근 30일)
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
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
),

-- 전월말 재고 날짜 결정 (fallback)
PREV_MONTH_STOCK_DT_RESOLVED AS (
  SELECT 
    PA.PREV_MONTH_END_DT,
    COALESCE(
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT = DATEADD(day, 1, PA.PREV_MONTH_END_DT)),
      (SELECT MAX(STOCK_DT) FROM SAP_FNF.DW_HMD_STOCK_SNAP_D WHERE STOCK_DT <= DATEADD(day, 1, PA.PREV_MONTH_END_DT))
    ) AS EFFECTIVE_PREV_MONTH_STOCK_DT
  FROM PARAM PA
),

-- 전월말 재고 스냅샷 (과시즌 재고만)
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
    AND ST.STOCK_DT = PMSD.EFFECTIVE_PREV_MONTH_STOCK_DT
  GROUP BY ST.SESN, ST.PRDT_CD
),

-- 전월말 재고에 연차 버킷 매핑
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

-- 전월말 정체재고 계산 (최근 1개월 판매가 전월말 기준)
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
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
),

-- 당월 판매 (월초~ASOFDATE)
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
  GROUP BY SB.YEAR_BUCKET, S.SESN, S.PRDT_CD
),

-- SKU 레벨 (제품 단위)
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
    -- 정체재고 계산: 최근 1개월 판매가 없거나 < 현재재고 × 0.1%
    CASE
      WHEN COALESCE(CS.CURR_STOCK_AMT, 0) > 0
        AND (
          COALESCE(MS.MONTHLY_TAG_SALES, 0) = 0  -- 판매 없음
          OR COALESCE(MS.MONTHLY_TAG_SALES, 0) < (COALESCE(CS.CURR_STOCK_AMT, 0) * 0.001)  -- 판매 < 0.1%
        )
      THEN COALESCE(CS.CURR_STOCK_AMT, 0)
      ELSE 0
    END AS STAGNANT_STOCK_AMT,
    COALESCE(PS.PERIOD_TAG_SALES, 0) AS DEPLETED_STOCK_AMT,  -- 소진재고액 = 판매금액
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
  -- 기초재고가 0인 SKU 제외 (성능 최적화 - 시즌 시작부터 있던 재고만 관리 대상)
  WHERE COALESCE(BS.BASE_STOCK_AMT, 0) > 0
),

-- CAT 레벨 (카테고리 단위)
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
    SUM(STAGNANT_STOCK_AMT) AS STAGNANT_STOCK_AMT,  -- 정체재고 집계
    SUM(PERIOD_TAG_SALES) AS DEPLETED_STOCK_AMT,  -- 소진재고액 = 판매금액 합계
    SUM(PERIOD_TAG_SALES) AS PERIOD_TAG_SALES,
    SUM(PERIOD_ACT_SALES) AS PERIOD_ACT_SALES,
    -- 할인율 계산
    CASE
      WHEN SUM(PERIOD_TAG_SALES) > 0
      THEN 1 - (SUM(PERIOD_ACT_SALES) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
      ELSE 0
    END AS DISCOUNT_RATE,
    -- 재고일수 계산 (RAW)
    CASE
      WHEN SUM(PERIOD_TAG_SALES) > 0
      THEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
      ELSE NULL
    END AS INV_DAYS_RAW,
    -- 재고일수 (상한 적용)
    CASE
      WHEN SUM(PERIOD_TAG_SALES) = 0 THEN -1  -- 판매없음 플래그
      WHEN SUM(PERIOD_TAG_SALES) > 0 THEN
        CASE
          WHEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0)) > 999 THEN 999
          ELSE ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0))
        END
      ELSE NULL
    END AS INV_DAYS,
    -- 365일 초과 여부 (판매없음도 빨간색)
    CASE
      WHEN SUM(PERIOD_TAG_SALES) = 0 THEN 1  -- 판매없음 = 빨간색
      WHEN ROUND(SUM(CURR_STOCK_AMT) * MAX(PERIOD_DAYS) / NULLIF(SUM(PERIOD_TAG_SALES), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y,
    MAX(PERIOD_DAYS) AS PERIOD_DAYS
  FROM SKU_LEVEL
  WHERE CAT2 IS NOT NULL
  GROUP BY YEAR_BUCKET, CAT2
),

-- YEAR 레벨 (연차 단위)
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
    SUM(STAGNANT_STOCK_AMT) AS STAGNANT_STOCK_AMT,  -- 정체재고 집계
    SUM(PERIOD_TAG_SALES) AS DEPLETED_STOCK_AMT,  -- 소진재고액 = 판매금액 합계
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

-- HEADER 레벨 (전체 합계)
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
    SUM(STAGNANT_STOCK_AMT) AS STAGNANT_STOCK_AMT,  -- 정체재고 집계
    SUM(PERIOD_TAG_SALES) AS DEPLETED_STOCK_AMT,  -- 소진재고액 = 판매금액 합계
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
    -- 전월말 재고 관련
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
    -- 당월 소진재고액
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

    // 파라미터 바인딩 (date를 여러 번 반복) - 윤년 계산 포함, 전월말/당월 계산 추가 31개
    const params = Array(31).fill(date);

    console.log('🔍 API Section3 - Executing query with params:', params.slice(0, 3));

    const rows = await executeSnowflakeQuery(query, params);

    console.log('✅ API Section3 - Query result:', {
      rowsCount: rows.length,
      levels: {
        header: rows.filter((r: any) => r.ROW_LEVEL === 'HEADER').length,
        year: rows.filter((r: any) => r.ROW_LEVEL === 'YEAR').length,
        cat: rows.filter((r: any) => r.ROW_LEVEL === 'CAT').length,
        sku: rows.filter((r: any) => r.ROW_LEVEL === 'SKU').length,
      },
      sampleRows: rows.slice(0, 5).map((r: any) => ({
        level: r.ROW_LEVEL,
        year_bucket: r.YEAR_BUCKET,
        base_stock: r.BASE_STOCK_AMT,
        curr_stock: r.CURR_STOCK_AMT,
      }))
    });

    // TW 리전일 때 환율 적용
    const isTwRegion = region === 'TW';
    const period = isTwRegion ? getPeriodFromDateString(date) : '';
    console.log(`💱 Exchange rate: ${isTwRegion ? 'Applying TWD->HKD conversion for period ' + period : 'No conversion (HKMC)'}`);

    // 환율 적용 헬퍼 함수
    const applyExchangeRate = (amount: number | null): number | null => {
      if (amount === null) return null;
      if (!isTwRegion) return amount;
      return convertTwdToHkd(amount, period);
    };

    // 레벨별로 데이터 분리
    const header = rows.find((r: any) => r.ROW_LEVEL === 'HEADER');
    const yearRows = rows.filter((r: any) => r.ROW_LEVEL === 'YEAR');
    const catRows = rows.filter((r: any) => r.ROW_LEVEL === 'CAT');
    const skuRows = rows.filter((r: any) => r.ROW_LEVEL === 'SKU');

    // 기초재고일과 판매기간 계산 (프론트 표시용, SQL 로직과 동일)
    const asofDate = new Date(date);
    const month = asofDate.getMonth() + 1;
    const year = asofDate.getFullYear();
    
    let baseStockDate: string;
    let periodStartDate: string;
    let seasonType: string; // 'FW' 또는 'SS'
    let currentYY: number; // 현재 시즌 연도(2자리)
    
    if (month >= 9 || month <= 2) {
      // FW (임시: 9월30일 기초, 10월1일 판매시작)
      const fwYear = month >= 9 ? year : year - 1;
      baseStockDate = `${fwYear}-09-30`;
      periodStartDate = `${fwYear}-10-01`;
      seasonType = 'FW';
      currentYY = month >= 9 ? year % 100 : (year - 1) % 100;
    } else {
      // SS (원래 로직: 2월말 기초, 3월1일 판매시작)
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      baseStockDate = `${year}-02-${isLeap ? '29' : '28'}`;
      periodStartDate = `${year}-03-01`;
      seasonType = 'SS';
      currentYY = year % 100;
    }

    // 연차별 시즌 계산 함수
    const getYearBucketSeasonCode = (yearBucket: string): string => {
      const seasonTypeLetter = seasonType === 'FW' ? 'F' : 'S';
      
      if (yearBucket === '1년차') {
        const yy = currentYY - 1;
        return `${yy.toString().padStart(2, '0')}${seasonTypeLetter}`;
      } else if (yearBucket === '2년차') {
        const yy = currentYY - 2;
        return `${yy.toString().padStart(2, '0')}${seasonTypeLetter}`;
      } else if (yearBucket === '3년차 이상') {
        // 3년차는 범위이므로 "~" 표시
        const yy = currentYY - 3;
        return `~${yy.toString().padStart(2, '0')}${seasonTypeLetter}`;
      }
      return '';
    };

    const response = {
      asof_date: date,
      base_stock_date: baseStockDate,
      period_start_date: periodStartDate,
      season_type: seasonType, // 'FW' 또는 'SS'
      region,
      brand,
      header: header ? {
        year_bucket: header.YEAR_BUCKET,
        base_stock_amt: applyExchangeRate(parseFloat(header.BASE_STOCK_AMT || 0)) || 0,
        curr_stock_amt: applyExchangeRate(parseFloat(header.CURR_STOCK_AMT || 0)) || 0,
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

    console.log('✅ API Section3 - Response prepared');
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ API Section3 - Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch old season inventory data',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
