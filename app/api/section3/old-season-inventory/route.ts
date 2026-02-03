import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { normalizeBrand } from '@/lib/store-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section3/old-season-inventory
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
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
    const brandFilter = normalizedBrand === 'M' ? "BRD_CD IN ('M','I')" : "BRD_CD = 'X'";
    
    const query = `
WITH
PARAM AS (
  SELECT
    ? AS ASOF_DATE,
    CASE WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN 'F' ELSE 'S' END AS CUR_TYP,
    CASE
      WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12) THEN MOD(YEAR(CAST(? AS DATE)), 100)
      WHEN MONTH(CAST(? AS DATE)) IN (1,2) THEN MOD(YEAR(CAST(? AS DATE)) - 1, 100)
      ELSE MOD(YEAR(CAST(? AS DATE)), 100)
    END AS CUR_YY,
    (DATEDIFF(day,
      DATEADD(day, 1, DATEADD(month, -3, CAST(? AS DATE))),
      CAST(? AS DATE)
    ) + 1) AS DAYS_3M_ASOF,
    (SELECT MAX(STOCK_DT)
     FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
     WHERE STOCK_DT <= DATEADD(day, 1, CAST(? AS DATE))
    ) AS EFFECTIVE_STOCK_DT,
    (SELECT MAX(STOCK_DT)
     FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
     WHERE STOCK_DT <= DATE '2026-01-01'
    ) AS STOCK_4Q_DT
),

SALE_BASE AS (
  SELECT
    SALE_DT,
    PRDT_CD,
    SESN,
    RIGHT(SESN, 1) AS SESN_TYP,
    TO_NUMBER(LEFT(SESN, 2)) AS SESN_YY,
    SUBSTR(PRDT_CD, 7, 2) AS CAT2,
    TAG_SALE_AMT,
    ACT_SALE_AMT
  FROM SAP_FNF.DW_HMD_SALE_D
  CROSS JOIN PARAM PA
  WHERE ${brandFilter}
    AND RIGHT(SESN, 1) = PA.CUR_TYP
),

STOCK_BASE AS (
  SELECT
    STOCK_DT,
    PRDT_CD,
    SESN,
    RIGHT(SESN, 1) AS SESN_TYP,
    TO_NUMBER(LEFT(SESN, 2)) AS SESN_YY,
    SUBSTR(PRDT_CD, 7, 2) AS CAT2,
    TAG_STOCK_AMT
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
  CROSS JOIN PARAM PA
  WHERE ${brandFilter}
    AND RIGHT(SESN, 1) = PA.CUR_TYP
),

SALE_4Q AS (
  SELECT
    SESN, SESN_TYP, SESN_YY, CAT2, PRDT_CD,
    SUM(TAG_SALE_AMT) AS TAG_SALES_4Q,
    SUM(ACT_SALE_AMT) AS ACT_SALES_4Q
  FROM SALE_BASE
  WHERE SALE_DT BETWEEN DATE '2025-10-01' AND DATE '2025-12-31'
  GROUP BY 1,2,3,4,5
),

STOCK_4Q_END AS (
  SELECT
    S.SESN, S.SESN_TYP, S.SESN_YY, S.CAT2, S.PRDT_CD,
    SUM(S.TAG_STOCK_AMT) AS TAG_STOCK_4Q_END
  FROM STOCK_BASE S
  CROSS JOIN PARAM P
  WHERE S.STOCK_DT = P.STOCK_4Q_DT
  GROUP BY 1,2,3,4,5
),

STOCK_ASOF AS (
  SELECT
    S.SESN, S.SESN_TYP, S.SESN_YY, S.CAT2, S.PRDT_CD,
    SUM(S.TAG_STOCK_AMT) AS TAG_STOCK_ASOF
  FROM STOCK_BASE S
  CROSS JOIN PARAM P
  WHERE S.STOCK_DT = P.EFFECTIVE_STOCK_DT
  GROUP BY 1,2,3,4,5
),

SALE_CUM AS (
  SELECT
    S.SESN, S.SESN_TYP, S.SESN_YY, S.CAT2, S.PRDT_CD,
    SUM(S.TAG_SALE_AMT) AS TAG_SALES_CUM,
    SUM(S.ACT_SALE_AMT) AS ACT_SALES_CUM
  FROM SALE_BASE S
  CROSS JOIN PARAM P
  WHERE S.SALE_DT BETWEEN DATE '2026-01-01' AND P.ASOF_DATE
  GROUP BY 1,2,3,4,5
),

SALE_3M_4Q AS (
  SELECT
    SESN, SESN_TYP, SESN_YY, CAT2, PRDT_CD,
    SUM(TAG_SALE_AMT) AS TAG_SALES_3M_4Q
  FROM SALE_BASE
  WHERE SALE_DT BETWEEN DATE '2025-10-01' AND DATE '2025-12-31'
  GROUP BY 1,2,3,4,5
),

SALE_3M_ASOF AS (
  SELECT
    S.SESN, S.SESN_TYP, S.SESN_YY, S.CAT2, S.PRDT_CD,
    SUM(S.TAG_SALE_AMT) AS TAG_SALES_3M_ASOF
  FROM SALE_BASE S
  CROSS JOIN PARAM P
  WHERE S.SALE_DT BETWEEN DATEADD(day, 1, DATEADD(month, -3, P.ASOF_DATE)) AND P.ASOF_DATE
  GROUP BY 1,2,3,4,5
),

PRDT_FACT AS (
  SELECT
    COALESCE(a.SESN, b.SESN, c.SESN, d.SESN) AS SESN,
    COALESCE(a.SESN_TYP, b.SESN_TYP, c.SESN_TYP, d.SESN_TYP) AS SESN_TYP,
    COALESCE(a.SESN_YY, b.SESN_YY, c.SESN_YY, d.SESN_YY) AS SESN_YY,
    COALESCE(a.CAT2, b.CAT2, c.CAT2, d.CAT2) AS CAT2,
    COALESCE(a.PRDT_CD, b.PRDT_CD, c.PRDT_CD, d.PRDT_CD) AS PRDT_CD,

    COALESCE(b.TAG_STOCK_4Q_END, 0) AS TAG_STOCK_4Q_END,
    COALESCE(a.TAG_SALES_4Q, 0) AS TAG_SALES_4Q,
    COALESCE(a.ACT_SALES_4Q, 0) AS ACT_SALES_4Q,
    COALESCE(f.TAG_SALES_3M_4Q, 0) AS TAG_SALES_3M_4Q,

    COALESCE(c.TAG_STOCK_ASOF, 0) AS TAG_STOCK_ASOF,
    COALESCE(d.TAG_SALES_CUM, 0) AS TAG_SALES_CUM,
    COALESCE(d.ACT_SALES_CUM, 0) AS ACT_SALES_CUM,
    COALESCE(e.TAG_SALES_3M_ASOF, 0) AS TAG_SALES_3M_ASOF
  FROM SALE_4Q a
  FULL OUTER JOIN STOCK_4Q_END b
    ON a.SESN=b.SESN AND a.PRDT_CD=b.PRDT_CD
  FULL OUTER JOIN STOCK_ASOF c
    ON COALESCE(a.SESN,b.SESN)=c.SESN
   AND COALESCE(a.PRDT_CD,b.PRDT_CD)=c.PRDT_CD
  FULL OUTER JOIN SALE_CUM d
    ON COALESCE(a.SESN,b.SESN,c.SESN)=d.SESN
   AND COALESCE(a.PRDT_CD,b.PRDT_CD,c.PRDT_CD)=d.PRDT_CD
  LEFT JOIN SALE_3M_4Q f
    ON COALESCE(a.SESN,b.SESN,c.SESN,d.SESN)=f.SESN
   AND COALESCE(a.PRDT_CD,b.PRDT_CD,c.PRDT_CD,d.PRDT_CD)=f.PRDT_CD
  LEFT JOIN SALE_3M_ASOF e
    ON COALESCE(a.SESN,b.SESN,c.SESN,d.SESN)=e.SESN
   AND COALESCE(a.PRDT_CD,b.PRDT_CD,c.PRDT_CD,d.PRDT_CD)=e.PRDT_CD
),

PRDT_WITH_YEAR_BUCKET AS (
  SELECT
    P.*,
    PA.CUR_TYP,
    PA.CUR_YY,
    PA.DAYS_3M_ASOF,
    CASE
      -- FW 시즌 중: F 시즌만 연차별로 표시
      WHEN PA.CUR_TYP='F' AND P.SESN_TYP='F' THEN
        CASE
          WHEN P.SESN_YY = PA.CUR_YY-1 THEN '1년차'
          WHEN P.SESN_YY = PA.CUR_YY-2 THEN '2년차'
          WHEN P.SESN_YY <= PA.CUR_YY-3 THEN '3년차 이상'
          ELSE NULL
        END
      -- SS 시즌 중: S 시즌만 연차별로 표시
      WHEN PA.CUR_TYP='S' AND P.SESN_TYP='S' THEN
        CASE
          WHEN P.SESN_YY = PA.CUR_YY-1 THEN '1년차'
          WHEN P.SESN_YY = PA.CUR_YY-2 THEN '2년차'
          WHEN P.SESN_YY <= PA.CUR_YY-3 THEN '3년차 이상'
          ELSE NULL
        END
      ELSE NULL
    END AS YEAR_BUCKET
  FROM PRDT_FACT P
  CROSS JOIN PARAM PA
  WHERE YEAR_BUCKET IS NOT NULL
),

SKU_LEVEL AS (
  SELECT
    3 AS SORT_LEVEL,
    'SKU' AS ROW_LEVEL,
    YEAR_BUCKET,
    SESN,
    CAT2,
    PRDT_CD,
    TAG_STOCK_4Q_END,
    TAG_SALES_4Q,
    CASE
      WHEN TAG_SALES_4Q > 0 THEN 1 - (ACT_SALES_4Q / NULLIF(TAG_SALES_4Q, 0))
      ELSE 0
    END AS DISC_RATE_4Q,
    -- 4Q 재고일수 (RAW)
    CASE
      WHEN TAG_SALES_3M_4Q > 0 THEN ROUND(TAG_STOCK_4Q_END * 92 / NULLIF(TAG_SALES_3M_4Q, 0))
      ELSE NULL
    END AS INV_DAYS_4Q_RAW,
    -- 4Q 재고일수 (상한 적용)
    CASE
      WHEN TAG_SALES_3M_4Q > 0 THEN
        CASE
          WHEN ROUND(TAG_STOCK_4Q_END * 92 / NULLIF(TAG_SALES_3M_4Q, 0)) > 999 THEN 999
          ELSE ROUND(TAG_STOCK_4Q_END * 92 / NULLIF(TAG_SALES_3M_4Q, 0))
        END
      ELSE NULL
    END AS INV_DAYS_4Q,
    0 AS IS_OVER_1Y_4Q,
    TAG_STOCK_ASOF,
    TAG_SALES_CUM,
    CASE
      WHEN TAG_SALES_CUM > 0 THEN 1 - (ACT_SALES_CUM / NULLIF(TAG_SALES_CUM, 0))
      ELSE 0
    END AS DISC_RATE_CUM,
    -- 선택일자 재고일수 (RAW)
    CASE
      WHEN TAG_SALES_3M_ASOF > 0 AND DAYS_3M_ASOF > 0
      THEN ROUND(TAG_STOCK_ASOF * DAYS_3M_ASOF / NULLIF(TAG_SALES_3M_ASOF, 0))
      ELSE NULL
    END AS INV_DAYS_ASOF_RAW,
    -- 선택일자 재고일수 (상한 적용)
    CASE
      WHEN TAG_SALES_3M_ASOF > 0 AND DAYS_3M_ASOF > 0 THEN
        CASE
          WHEN ROUND(TAG_STOCK_ASOF * DAYS_3M_ASOF / NULLIF(TAG_SALES_3M_ASOF, 0)) > 999 THEN 999
          ELSE ROUND(TAG_STOCK_ASOF * DAYS_3M_ASOF / NULLIF(TAG_SALES_3M_ASOF, 0))
        END
      ELSE NULL
    END AS INV_DAYS_ASOF,
    0 AS IS_OVER_1Y_ASOF
  FROM PRDT_WITH_YEAR_BUCKET
),

CAT_LEVEL AS (
  SELECT
    2 AS SORT_LEVEL,
    'CAT' AS ROW_LEVEL,
    YEAR_BUCKET,
    NULL AS SESN,
    CAT2,
    NULL AS PRDT_CD,
    SUM(TAG_STOCK_4Q_END) AS TAG_STOCK_4Q_END,
    SUM(TAG_SALES_4Q) AS TAG_SALES_4Q,
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0
      THEN 1 - (SUM(TAG_SALES_4Q * (1 - DISC_RATE_4Q)) / NULLIF(SUM(TAG_SALES_4Q), 0))
      ELSE 0
    END AS DISC_RATE_4Q,
    -- 4Q 재고일수 (RAW)
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0
      THEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0))
      ELSE NULL
    END AS INV_DAYS_4Q_RAW,
    -- 4Q 재고일수 (상한 적용)
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0 THEN
        CASE
          WHEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0)) > 999 THEN 999
          ELSE ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0))
        END
      ELSE NULL
    END AS INV_DAYS_4Q,
    -- 365일 초과 여부 (색상 플래그)
    CASE
      WHEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y_4Q,
    SUM(TAG_STOCK_ASOF) AS TAG_STOCK_ASOF,
    SUM(TAG_SALES_CUM) AS TAG_SALES_CUM,
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0
      THEN 1 - (SUM(TAG_SALES_CUM * (1 - DISC_RATE_CUM)) / NULLIF(SUM(TAG_SALES_CUM), 0))
      ELSE 0
    END AS DISC_RATE_CUM,
    -- 선택일자 재고일수 (RAW)
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0
      THEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0))
      ELSE NULL
    END AS INV_DAYS_ASOF_RAW,
    -- 선택일자 재고일수 (상한 적용)
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0 THEN
        CASE
          WHEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0)) > 999 THEN 999
          ELSE ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0))
        END
      ELSE NULL
    END AS INV_DAYS_ASOF,
    -- 365일 초과 여부 (색상 플래그)
    CASE
      WHEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y_ASOF
  FROM SKU_LEVEL
  WHERE CAT2 IS NOT NULL
  GROUP BY YEAR_BUCKET, CAT2
),

YEAR_LEVEL AS (
  SELECT
    1 AS SORT_LEVEL,
    'YEAR' AS ROW_LEVEL,
    YEAR_BUCKET,
    NULL AS SESN,
    NULL AS CAT2,
    NULL AS PRDT_CD,
    SUM(TAG_STOCK_4Q_END) AS TAG_STOCK_4Q_END,
    SUM(TAG_SALES_4Q) AS TAG_SALES_4Q,
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0
      THEN 1 - (SUM(TAG_SALES_4Q * (1 - DISC_RATE_4Q)) / NULLIF(SUM(TAG_SALES_4Q), 0))
      ELSE 0
    END AS DISC_RATE_4Q,
    -- 4Q 재고일수 (RAW)
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0
      THEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0))
      ELSE NULL
    END AS INV_DAYS_4Q_RAW,
    -- 4Q 재고일수 (상한 적용)
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0 THEN
        CASE
          WHEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0)) > 999 THEN 999
          ELSE ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0))
        END
      ELSE NULL
    END AS INV_DAYS_4Q,
    -- 365일 초과 여부 (색상 플래그)
    CASE
      WHEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y_4Q,
    SUM(TAG_STOCK_ASOF) AS TAG_STOCK_ASOF,
    SUM(TAG_SALES_CUM) AS TAG_SALES_CUM,
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0
      THEN 1 - (SUM(TAG_SALES_CUM * (1 - DISC_RATE_CUM)) / NULLIF(SUM(TAG_SALES_CUM), 0))
      ELSE 0
    END AS DISC_RATE_CUM,
    -- 선택일자 재고일수 (RAW)
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0
      THEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0))
      ELSE NULL
    END AS INV_DAYS_ASOF_RAW,
    -- 선택일자 재고일수 (상한 적용)
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0 THEN
        CASE
          WHEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0)) > 999 THEN 999
          ELSE ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0))
        END
      ELSE NULL
    END AS INV_DAYS_ASOF,
    -- 365일 초과 여부 (색상 플래그)
    CASE
      WHEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0)) > 365 THEN 1
      ELSE 0
    END AS IS_OVER_1Y_ASOF
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
    SUM(TAG_STOCK_4Q_END) AS TAG_STOCK_4Q_END,
    SUM(TAG_SALES_4Q) AS TAG_SALES_4Q,
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0
      THEN 1 - (SUM(TAG_SALES_4Q * (1 - DISC_RATE_4Q)) / NULLIF(SUM(TAG_SALES_4Q), 0))
      ELSE 0
    END AS DISC_RATE_4Q,
    -- 4Q 재고일수 (RAW)
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0
      THEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0))
      ELSE NULL
    END AS INV_DAYS_4Q_RAW,
    -- 4Q 재고일수 (상한 적용)
    CASE
      WHEN SUM(TAG_SALES_4Q) > 0 THEN
        CASE
          WHEN ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0)) > 999 THEN 999
          ELSE ROUND(SUM(TAG_STOCK_4Q_END) * 92 / NULLIF(SUM(TAG_SALES_4Q), 0))
        END
      ELSE NULL
    END AS INV_DAYS_4Q,
    0 AS IS_OVER_1Y_4Q,
    SUM(TAG_STOCK_ASOF) AS TAG_STOCK_ASOF,
    SUM(TAG_SALES_CUM) AS TAG_SALES_CUM,
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0
      THEN 1 - (SUM(TAG_SALES_CUM * (1 - DISC_RATE_CUM)) / NULLIF(SUM(TAG_SALES_CUM), 0))
      ELSE 0
    END AS DISC_RATE_CUM,
    -- 선택일자 재고일수 (RAW)
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0
      THEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0))
      ELSE NULL
    END AS INV_DAYS_ASOF_RAW,
    -- 선택일자 재고일수 (상한 적용)
    CASE
      WHEN SUM(TAG_SALES_CUM) > 0 THEN
        CASE
          WHEN ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0)) > 999 THEN 999
          ELSE ROUND(SUM(TAG_STOCK_ASOF) * 90 / NULLIF(SUM(TAG_SALES_CUM), 0))
        END
      ELSE NULL
    END AS INV_DAYS_ASOF,
    0 AS IS_OVER_1Y_ASOF
  FROM SKU_LEVEL
)

SELECT * FROM HEADER_LEVEL
UNION ALL
SELECT * FROM YEAR_LEVEL
UNION ALL
SELECT * FROM CAT_LEVEL
UNION ALL
SELECT * FROM SKU_LEVEL
ORDER BY
  SORT_LEVEL,
  CASE YEAR_BUCKET
    WHEN 'ALL' THEN 0
    WHEN '1년차' THEN 1
    WHEN '2년차' THEN 2
    WHEN '3년차 이상' THEN 3
    WHEN 'SS 과시즌' THEN 4
    ELSE 99
  END,
  CAT2 NULLS FIRST,
  TAG_STOCK_ASOF DESC,
  PRDT_CD NULLS FIRST
    `;

    // 파라미터: date를 10번 반복
    const params = Array(10).fill(date);

    console.log('🔍 Executing Section3 query with params:', { date, paramsCount: params.length });

    const rows = await executeSnowflakeQuery(query, params);

    console.log('📊 Section3 Query Result:', {
      region,
      brand,
      date,
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
        cat2: r.CAT2,
        prdt_cd: r.PRDT_CD,
        stock_4q: r.TAG_STOCK_4Q_END,
        stock_asof: r.TAG_STOCK_ASOF,
      }))
    });

    // 레벨별로 데이터 분리
    const header = rows.find((r: any) => r.ROW_LEVEL === 'HEADER');
    const yearRows = rows.filter((r: any) => r.ROW_LEVEL === 'YEAR');
    const catRows = rows.filter((r: any) => r.ROW_LEVEL === 'CAT');
    const skuRows = rows.filter((r: any) => r.ROW_LEVEL === 'SKU');

    const response = {
      asof_date: date,
      region,
      brand,
      header: header ? {
        year_bucket: header.YEAR_BUCKET,
        tag_stock_4q_end: parseFloat(header.TAG_STOCK_4Q_END || 0),
        tag_sales_4q: parseFloat(header.TAG_SALES_4Q || 0),
        disc_rate_4q: parseFloat(header.DISC_RATE_4Q || 0),
        inv_days_4q: header.INV_DAYS_4Q ? parseFloat(header.INV_DAYS_4Q) : null,
        tag_stock_asof: parseFloat(header.TAG_STOCK_ASOF || 0),
        tag_sales_cum: parseFloat(header.TAG_SALES_CUM || 0),
        disc_rate_cum: parseFloat(header.DISC_RATE_CUM || 0),
        inv_days_asof: header.INV_DAYS_ASOF ? parseFloat(header.INV_DAYS_ASOF) : null,
      } : null,
      years: yearRows.map((row: any) => ({
        year_bucket: row.YEAR_BUCKET,
        tag_stock_4q_end: parseFloat(row.TAG_STOCK_4Q_END || 0),
        tag_sales_4q: parseFloat(row.TAG_SALES_4Q || 0),
        disc_rate_4q: parseFloat(row.DISC_RATE_4Q || 0),
        inv_days_4q_raw: row.INV_DAYS_4Q_RAW ? parseFloat(row.INV_DAYS_4Q_RAW) : null,
        inv_days_4q: row.INV_DAYS_4Q ? parseFloat(row.INV_DAYS_4Q) : null,
        is_over_1y_4q: row.IS_OVER_1Y_4Q === 1,
        tag_stock_asof: parseFloat(row.TAG_STOCK_ASOF || 0),
        tag_sales_cum: parseFloat(row.TAG_SALES_CUM || 0),
        disc_rate_cum: parseFloat(row.DISC_RATE_CUM || 0),
        inv_days_asof_raw: row.INV_DAYS_ASOF_RAW ? parseFloat(row.INV_DAYS_ASOF_RAW) : null,
        inv_days_asof: row.INV_DAYS_ASOF ? parseFloat(row.INV_DAYS_ASOF) : null,
        is_over_1y_asof: row.IS_OVER_1Y_ASOF === 1,
      })),
      categories: catRows.map((row: any) => ({
        year_bucket: row.YEAR_BUCKET,
        cat2: row.CAT2,
        tag_stock_4q_end: parseFloat(row.TAG_STOCK_4Q_END || 0),
        tag_sales_4q: parseFloat(row.TAG_SALES_4Q || 0),
        disc_rate_4q: parseFloat(row.DISC_RATE_4Q || 0),
        inv_days_4q_raw: row.INV_DAYS_4Q_RAW ? parseFloat(row.INV_DAYS_4Q_RAW) : null,
        inv_days_4q: row.INV_DAYS_4Q ? parseFloat(row.INV_DAYS_4Q) : null,
        is_over_1y_4q: row.IS_OVER_1Y_4Q === 1,
        tag_stock_asof: parseFloat(row.TAG_STOCK_ASOF || 0),
        tag_sales_cum: parseFloat(row.TAG_SALES_CUM || 0),
        disc_rate_cum: parseFloat(row.DISC_RATE_CUM || 0),
        inv_days_asof_raw: row.INV_DAYS_ASOF_RAW ? parseFloat(row.INV_DAYS_ASOF_RAW) : null,
        inv_days_asof: row.INV_DAYS_ASOF ? parseFloat(row.INV_DAYS_ASOF) : null,
        is_over_1y_asof: row.IS_OVER_1Y_ASOF === 1,
      })),
      skus: skuRows.map((row: any) => ({
        year_bucket: row.YEAR_BUCKET,
        sesn: row.SESN,
        cat2: row.CAT2,
        prdt_cd: row.PRDT_CD,
        tag_stock_4q_end: parseFloat(row.TAG_STOCK_4Q_END || 0),
        tag_sales_4q: parseFloat(row.TAG_SALES_4Q || 0),
        disc_rate_4q: parseFloat(row.DISC_RATE_4Q || 0),
        inv_days_4q_raw: row.INV_DAYS_4Q_RAW ? parseFloat(row.INV_DAYS_4Q_RAW) : null,
        inv_days_4q: row.INV_DAYS_4Q ? parseFloat(row.INV_DAYS_4Q) : null,
        tag_stock_asof: parseFloat(row.TAG_STOCK_ASOF || 0),
        tag_sales_cum: parseFloat(row.TAG_SALES_CUM || 0),
        disc_rate_cum: parseFloat(row.DISC_RATE_CUM || 0),
        inv_days_asof_raw: row.INV_DAYS_ASOF_RAW ? parseFloat(row.INV_DAYS_ASOF_RAW) : null,
        inv_days_asof: row.INV_DAYS_ASOF ? parseFloat(row.INV_DAYS_ASOF) : null,
      })),
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Error in /api/section3/old-season-inventory:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Failed to fetch old season inventory data', message: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
