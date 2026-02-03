/*******************************************************************************
 * 섹션3: 과시즌 재고 소진현황 - Discovery (X)
 * 
 * 목적: 과거 시즌 재고의 소진 현황을 연차별/카테고리별/SKU별로 제공
 * 
 * 파라미터:
 *   :ASOF_DATE - 선택일자 (YYYY-MM-DD, 영업일 기준)
 *   
 * 브랜드: Discovery (BRD_CD = 'X')
 * 
 * 출력 레벨:
 *   HEADER: 전체 합계
 *   YEAR: 대분류 (1년차, 2년차, 3년차 이상, SS 과시즌)
 *   CAT: 중분류 (연차 + 카테고리 2글자)
 *   SKU: 소분류 (연차 + SKU 단위)
 *   
 * 넌시즌(N) 완전 제외: RIGHT(SESN,1) IN ('F','S')만 허용
 * 매장 필터 없음: warehouse 포함 전체 집계
 ******************************************************************************/

WITH 
-- 선택일자 기준 현재 진행 시즌 YY 계산
current_season AS (
  SELECT 
    :ASOF_DATE AS asof_date,
    DATEADD(DAY, 1, :ASOF_DATE) AS stock_dt_asof,
    CASE 
      WHEN MONTH(:ASOF_DATE) BETWEEN 9 AND 12 THEN YEAR(:ASOF_DATE) % 100
      WHEN MONTH(:ASOF_DATE) BETWEEN 1 AND 2 THEN (YEAR(:ASOF_DATE) - 1) % 100
      ELSE YEAR(:ASOF_DATE) % 100
    END AS current_yy,
    CASE 
      WHEN MONTH(:ASOF_DATE) BETWEEN 9 AND 12 THEN 'F'
      WHEN MONTH(:ASOF_DATE) BETWEEN 1 AND 2 THEN 'F'
      ELSE 'S'
    END AS current_season_typ
),

-- 4Q 고정 구간 정의
fixed_4q AS (
  SELECT 
    DATE '2025-10-01' AS sale_start_4q,
    DATE '2025-12-31' AS sale_end_4q,
    DATE '2026-01-01' AS stock_dt_4q_end,
    92 AS days_4q
),

-- 시즌별 연차 버킷 분류 (넌시즌 N 완전 제외)
season_buckets AS (
  SELECT DISTINCT
    s.SESN,
    CAST(LEFT(s.SESN, 2) AS INTEGER) AS sesn_yy,
    RIGHT(s.SESN, 1) AS sesn_typ,
    c.current_yy,
    c.current_season_typ,
    CASE
      -- FW 진행 중일 때
      WHEN c.current_season_typ = 'F' AND RIGHT(s.SESN, 1) = 'F' THEN
        CASE
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = c.current_yy - 1 THEN '1년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = c.current_yy - 2 THEN '2년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) <= c.current_yy - 3 THEN '3년차 이상'
          ELSE NULL
        END
      -- SS 진행 중일 때
      WHEN c.current_season_typ = 'S' AND RIGHT(s.SESN, 1) = 'S' THEN
        CASE
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = c.current_yy - 1 THEN '1년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) = c.current_yy - 2 THEN '2년차'
          WHEN CAST(LEFT(s.SESN, 2) AS INTEGER) <= c.current_yy - 3 THEN '3년차 이상'
          ELSE NULL
        END
      -- SS 과시즌 (24S 이상 전체)
      WHEN RIGHT(s.SESN, 1) = 'S' AND CAST(LEFT(s.SESN, 2) AS INTEGER) >= 24 THEN 'SS 과시즌'
      ELSE NULL
    END AS year_bucket
  FROM (
    SELECT DISTINCT SESN 
    FROM SAP_FNF.DW_HMD_SALE_D 
    WHERE BRD_CD = 'X'
      AND RIGHT(SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
    UNION
    SELECT DISTINCT SESN 
    FROM SAP_FNF.DW_HMD_STOR_D 
    WHERE BRD_CD = 'X'
      AND RIGHT(SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  ) s
  CROSS JOIN current_season c
  WHERE year_bucket IS NOT NULL
),

-- 4Q 판매 집계 (SKU 단위)
sales_4q AS (
  SELECT
    sb.year_bucket,
    s.SESN,
    s.PRDT_CD,
    s.COLOR_CD,
    s.SIZE_CD,
    CASE 
      WHEN POSITION('AB' IN s.PRDT_CD) > 0 
      THEN SUBSTR(s.PRDT_CD, POSITION('AB' IN s.PRDT_CD) + 2, 2)
      ELSE NULL 
    END AS cat2,
    SUM(s.TAG_SALE_AMT) AS tag_sales_4q,
    SUM(s.ACT_SALE_AMT) AS act_sales_4q
  FROM SAP_FNF.DW_HMD_SALE_D s
  CROSS JOIN fixed_4q f
  INNER JOIN season_buckets sb ON s.SESN = sb.SESN
  WHERE s.BRD_CD = 'X'
    AND s.SALE_DT BETWEEN f.sale_start_4q AND f.sale_end_4q
    AND RIGHT(s.SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  GROUP BY sb.year_bucket, s.SESN, s.PRDT_CD, s.COLOR_CD, s.SIZE_CD
),

-- 4Q말 재고 (SKU 단위)
stock_4q_end AS (
  SELECT
    sb.year_bucket,
    s.SESN,
    s.PRDT_CD,
    s.COLOR_CD,
    s.SIZE_CD,
    CASE 
      WHEN POSITION('AB' IN s.PRDT_CD) > 0 
      THEN SUBSTR(s.PRDT_CD, POSITION('AB' IN s.PRDT_CD) + 2, 2)
      ELSE NULL 
    END AS cat2,
    SUM(s.TAG_STOR_AMT) AS tag_stock_4q_end
  FROM SAP_FNF.DW_HMD_STOR_D s
  CROSS JOIN fixed_4q f
  INNER JOIN season_buckets sb ON s.SESN = sb.SESN
  WHERE s.BRD_CD = 'X'
    AND s.STOR_DT = f.stock_dt_4q_end
    AND RIGHT(s.SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  GROUP BY sb.year_bucket, s.SESN, s.PRDT_CD, s.COLOR_CD, s.SIZE_CD
),

-- 4Q 재고일수 계산용 3개월 판매 (4Q 구간 = 3개월)
sales_3m_4q AS (
  SELECT
    sb.year_bucket,
    s.SESN,
    s.PRDT_CD,
    s.COLOR_CD,
    s.SIZE_CD,
    SUM(s.TAG_SALE_AMT) AS tag_sales_3m_4q
  FROM SAP_FNF.DW_HMD_SALE_D s
  CROSS JOIN fixed_4q f
  INNER JOIN season_buckets sb ON s.SESN = sb.SESN
  WHERE s.BRD_CD = 'X'
    AND s.SALE_DT BETWEEN f.sale_start_4q AND f.sale_end_4q
    AND RIGHT(s.SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  GROUP BY sb.year_bucket, s.SESN, s.PRDT_CD, s.COLOR_CD, s.SIZE_CD
),

-- 선택일자 기준 누적 판매 (2026-01-01 ~ ASOF_DATE)
sales_cum_asof AS (
  SELECT
    sb.year_bucket,
    s.SESN,
    s.PRDT_CD,
    s.COLOR_CD,
    s.SIZE_CD,
    CASE 
      WHEN POSITION('AB' IN s.PRDT_CD) > 0 
      THEN SUBSTR(s.PRDT_CD, POSITION('AB' IN s.PRDT_CD) + 2, 2)
      ELSE NULL 
    END AS cat2,
    SUM(s.TAG_SALE_AMT) AS tag_sales_cum,
    SUM(s.ACT_SALE_AMT) AS act_sales_cum
  FROM SAP_FNF.DW_HMD_SALE_D s
  CROSS JOIN current_season c
  INNER JOIN season_buckets sb ON s.SESN = sb.SESN
  WHERE s.BRD_CD = 'X'
    AND s.SALE_DT BETWEEN DATE '2026-01-01' AND c.asof_date
    AND RIGHT(s.SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  GROUP BY sb.year_bucket, s.SESN, s.PRDT_CD, s.COLOR_CD, s.SIZE_CD
),

-- 선택일자 재고
stock_asof AS (
  SELECT
    sb.year_bucket,
    s.SESN,
    s.PRDT_CD,
    s.COLOR_CD,
    s.SIZE_CD,
    CASE 
      WHEN POSITION('AB' IN s.PRDT_CD) > 0 
      THEN SUBSTR(s.PRDT_CD, POSITION('AB' IN s.PRDT_CD) + 2, 2)
      ELSE NULL 
    END AS cat2,
    SUM(s.TAG_STOR_AMT) AS tag_stock_asof
  FROM SAP_FNF.DW_HMD_STOR_D s
  CROSS JOIN current_season c
  INNER JOIN season_buckets sb ON s.SESN = sb.SESN
  WHERE s.BRD_CD = 'X'
    AND s.STOR_DT = c.stock_dt_asof
    AND RIGHT(s.SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  GROUP BY sb.year_bucket, s.SESN, s.PRDT_CD, s.COLOR_CD, s.SIZE_CD
),

-- 선택일자 재고일수 계산용 3개월 판매
sales_3m_asof AS (
  SELECT
    sb.year_bucket,
    s.SESN,
    s.PRDT_CD,
    s.COLOR_CD,
    s.SIZE_CD,
    SUM(s.TAG_SALE_AMT) AS tag_sales_3m_asof,
    DATEDIFF(DAY, DATEADD(MONTH, -3, c.asof_date) + 1, c.asof_date) AS days_3m_asof
  FROM SAP_FNF.DW_HMD_SALE_D s
  CROSS JOIN current_season c
  INNER JOIN season_buckets sb ON s.SESN = sb.SESN
  WHERE s.BRD_CD = 'X'
    AND s.SALE_DT BETWEEN DATEADD(MONTH, -3, c.asof_date) + 1 AND c.asof_date
    AND RIGHT(s.SESN, 1) IN ('F', 'S')  -- 넌시즌 제외
  GROUP BY sb.year_bucket, s.SESN, s.PRDT_CD, s.COLOR_CD, s.SIZE_CD, c.asof_date
),

-- SKU 레벨 집계
sku_level AS (
  SELECT
    3 AS sort_level,
    'SKU' AS row_level,
    COALESCE(sq4.year_bucket, stq.year_bucket, sc.year_bucket, sa.year_bucket) AS year_bucket,
    COALESCE(sq4.SESN, stq.SESN, sc.SESN, sa.SESN) AS sesn,
    COALESCE(sq4.cat2, stq.cat2, sc.cat2, sa.cat2) AS cat2,
    COALESCE(sq4.PRDT_CD, stq.PRDT_CD, sc.PRDT_CD, sa.PRDT_CD) AS prdt_cd,
    COALESCE(sq4.COLOR_CD, stq.COLOR_CD, sc.COLOR_CD, sa.COLOR_CD) AS color_cd,
    COALESCE(sq4.SIZE_CD, stq.SIZE_CD, sc.SIZE_CD, sa.SIZE_CD) AS size_cd,
    
    -- 4Q 지표
    COALESCE(stq.tag_stock_4q_end, 0) AS tag_stock_4q_end,
    COALESCE(sq4.tag_sales_4q, 0) AS tag_sales_4q,
    CASE 
      WHEN COALESCE(sq4.tag_sales_4q, 0) > 0 
      THEN 1 - (COALESCE(sq4.act_sales_4q, 0) / NULLIF(sq4.tag_sales_4q, 0))
      ELSE 0 
    END AS disc_rate_4q,
    CASE 
      WHEN COALESCE(s3q.tag_sales_3m_4q, 0) > 0 
      THEN COALESCE(stq.tag_stock_4q_end, 0) * 92 / NULLIF(s3q.tag_sales_3m_4q, 0)
      ELSE NULL 
    END AS inv_days_4q,
    
    -- 선택일자 기준 지표
    COALESCE(sa.tag_stock_asof, 0) AS tag_stock_asof,
    COALESCE(sc.tag_sales_cum, 0) AS tag_sales_cum,
    CASE 
      WHEN COALESCE(sc.tag_sales_cum, 0) > 0 
      THEN 1 - (COALESCE(sc.act_sales_cum, 0) / NULLIF(sc.tag_sales_cum, 0))
      ELSE 0 
    END AS disc_rate_cum,
    CASE 
      WHEN COALESCE(s3a.tag_sales_3m_asof, 0) > 0 AND s3a.days_3m_asof > 0
      THEN COALESCE(sa.tag_stock_asof, 0) * s3a.days_3m_asof / NULLIF(s3a.tag_sales_3m_asof, 0)
      ELSE NULL 
    END AS inv_days_asof
    
  FROM sales_4q sq4
  FULL OUTER JOIN stock_4q_end stq 
    ON sq4.year_bucket = stq.year_bucket 
    AND sq4.SESN = stq.SESN 
    AND sq4.PRDT_CD = stq.PRDT_CD 
    AND sq4.COLOR_CD = stq.COLOR_CD 
    AND sq4.SIZE_CD = stq.SIZE_CD
  FULL OUTER JOIN sales_cum_asof sc 
    ON COALESCE(sq4.year_bucket, stq.year_bucket) = sc.year_bucket 
    AND COALESCE(sq4.SESN, stq.SESN) = sc.SESN 
    AND COALESCE(sq4.PRDT_CD, stq.PRDT_CD) = sc.PRDT_CD 
    AND COALESCE(sq4.COLOR_CD, stq.COLOR_CD) = sc.COLOR_CD 
    AND COALESCE(sq4.SIZE_CD, stq.SIZE_CD) = sc.SIZE_CD
  FULL OUTER JOIN stock_asof sa 
    ON COALESCE(sq4.year_bucket, stq.year_bucket, sc.year_bucket) = sa.year_bucket 
    AND COALESCE(sq4.SESN, stq.SESN, sc.SESN) = sa.SESN 
    AND COALESCE(sq4.PRDT_CD, stq.PRDT_CD, sc.PRDT_CD) = sa.PRDT_CD 
    AND COALESCE(sq4.COLOR_CD, stq.COLOR_CD, sc.COLOR_CD) = sa.COLOR_CD 
    AND COALESCE(sq4.SIZE_CD, stq.SIZE_CD, sc.SIZE_CD) = sa.SIZE_CD
  LEFT JOIN sales_3m_4q s3q 
    ON COALESCE(sq4.year_bucket, stq.year_bucket, sc.year_bucket, sa.year_bucket) = s3q.year_bucket 
    AND COALESCE(sq4.SESN, stq.SESN, sc.SESN, sa.SESN) = s3q.SESN 
    AND COALESCE(sq4.PRDT_CD, stq.PRDT_CD, sc.PRDT_CD, sa.PRDT_CD) = s3q.PRDT_CD 
    AND COALESCE(sq4.COLOR_CD, stq.COLOR_CD, sc.COLOR_CD, sa.COLOR_CD) = s3q.COLOR_CD 
    AND COALESCE(sq4.SIZE_CD, stq.SIZE_CD, sc.SIZE_CD, sa.SIZE_CD) = s3q.SIZE_CD
  LEFT JOIN sales_3m_asof s3a 
    ON COALESCE(sq4.year_bucket, stq.year_bucket, sc.year_bucket, sa.year_bucket) = s3a.year_bucket 
    AND COALESCE(sq4.SESN, stq.SESN, sc.SESN, sa.SESN) = s3a.SESN 
    AND COALESCE(sq4.PRDT_CD, stq.PRDT_CD, sc.PRDT_CD, sa.PRDT_CD) = s3a.PRDT_CD 
    AND COALESCE(sq4.COLOR_CD, stq.COLOR_CD, sc.COLOR_CD, sa.COLOR_CD) = s3a.COLOR_CD 
    AND COALESCE(sq4.SIZE_CD, stq.SIZE_CD, sc.SIZE_CD, sa.SIZE_CD) = s3a.SIZE_CD
),

-- 중분류(CAT) 레벨 집계
cat_level AS (
  SELECT
    2 AS sort_level,
    'CAT' AS row_level,
    year_bucket,
    NULL AS sesn,
    cat2,
    NULL AS prdt_cd,
    NULL AS color_cd,
    NULL AS size_cd,
    
    SUM(tag_stock_4q_end) AS tag_stock_4q_end,
    SUM(tag_sales_4q) AS tag_sales_4q,
    CASE 
      WHEN SUM(tag_sales_4q) > 0 
      THEN 1 - (SUM(tag_sales_4q * (1 - disc_rate_4q)) / NULLIF(SUM(tag_sales_4q), 0))
      ELSE 0 
    END AS disc_rate_4q,
    CASE 
      WHEN SUM(tag_sales_4q) > 0 
      THEN SUM(tag_stock_4q_end) * 92 / NULLIF(SUM(tag_sales_4q), 0)
      ELSE NULL 
    END AS inv_days_4q,
    
    SUM(tag_stock_asof) AS tag_stock_asof,
    SUM(tag_sales_cum) AS tag_sales_cum,
    CASE 
      WHEN SUM(tag_sales_cum) > 0 
      THEN 1 - (SUM(tag_sales_cum * (1 - disc_rate_cum)) / NULLIF(SUM(tag_sales_cum), 0))
      ELSE 0 
    END AS disc_rate_cum,
    CASE 
      WHEN SUM(tag_sales_cum) > 0 
      THEN SUM(tag_stock_asof) * 90 / NULLIF(SUM(tag_sales_cum), 0)
      ELSE NULL 
    END AS inv_days_asof
    
  FROM sku_level
  WHERE cat2 IS NOT NULL
  GROUP BY year_bucket, cat2
),

-- 대분류(YEAR) 레벨 집계
year_level AS (
  SELECT
    1 AS sort_level,
    'YEAR' AS row_level,
    year_bucket,
    NULL AS sesn,
    NULL AS cat2,
    NULL AS prdt_cd,
    NULL AS color_cd,
    NULL AS size_cd,
    
    SUM(tag_stock_4q_end) AS tag_stock_4q_end,
    SUM(tag_sales_4q) AS tag_sales_4q,
    CASE 
      WHEN SUM(tag_sales_4q) > 0 
      THEN 1 - (SUM(tag_sales_4q * (1 - disc_rate_4q)) / NULLIF(SUM(tag_sales_4q), 0))
      ELSE 0 
    END AS disc_rate_4q,
    CASE 
      WHEN SUM(tag_sales_4q) > 0 
      THEN SUM(tag_stock_4q_end) * 92 / NULLIF(SUM(tag_sales_4q), 0)
      ELSE NULL 
    END AS inv_days_4q,
    
    SUM(tag_stock_asof) AS tag_stock_asof,
    SUM(tag_sales_cum) AS tag_sales_cum,
    CASE 
      WHEN SUM(tag_sales_cum) > 0 
      THEN 1 - (SUM(tag_sales_cum * (1 - disc_rate_cum)) / NULLIF(SUM(tag_sales_cum), 0))
      ELSE 0 
    END AS disc_rate_cum,
    CASE 
      WHEN SUM(tag_sales_cum) > 0 
      THEN SUM(tag_stock_asof) * 90 / NULLIF(SUM(tag_sales_cum), 0)
      ELSE NULL 
    END AS inv_days_asof
    
  FROM sku_level
  GROUP BY year_bucket
),

-- 헤더(전체 합계) 레벨
header_level AS (
  SELECT
    0 AS sort_level,
    'HEADER' AS row_level,
    'ALL' AS year_bucket,
    NULL AS sesn,
    NULL AS cat2,
    NULL AS prdt_cd,
    NULL AS color_cd,
    NULL AS size_cd,
    
    SUM(tag_stock_4q_end) AS tag_stock_4q_end,
    SUM(tag_sales_4q) AS tag_sales_4q,
    CASE 
      WHEN SUM(tag_sales_4q) > 0 
      THEN 1 - (SUM(tag_sales_4q * (1 - disc_rate_4q)) / NULLIF(SUM(tag_sales_4q), 0))
      ELSE 0 
    END AS disc_rate_4q,
    CASE 
      WHEN SUM(tag_sales_4q) > 0 
      THEN SUM(tag_stock_4q_end) * 92 / NULLIF(SUM(tag_sales_4q), 0)
      ELSE NULL 
    END AS inv_days_4q,
    
    SUM(tag_stock_asof) AS tag_stock_asof,
    SUM(tag_sales_cum) AS tag_sales_cum,
    CASE 
      WHEN SUM(tag_sales_cum) > 0 
      THEN 1 - (SUM(tag_sales_cum * (1 - disc_rate_cum)) / NULLIF(SUM(tag_sales_cum), 0))
      ELSE 0 
    END AS disc_rate_cum,
    CASE 
      WHEN SUM(tag_sales_cum) > 0 
      THEN SUM(tag_stock_asof) * 90 / NULLIF(SUM(tag_sales_cum), 0)
      ELSE NULL 
    END AS inv_days_asof
    
  FROM sku_level
)

-- 최종 결과 (모든 레벨 UNION ALL)
SELECT 
  sort_level,
  row_level,
  year_bucket,
  sesn,
  cat2,
  prdt_cd,
  color_cd,
  size_cd,
  tag_stock_4q_end,
  tag_sales_4q,
  disc_rate_4q,
  inv_days_4q,
  tag_stock_asof,
  tag_sales_cum,
  disc_rate_cum,
  inv_days_asof
FROM header_level
UNION ALL
SELECT * FROM year_level
UNION ALL
SELECT * FROM cat_level
UNION ALL
SELECT * FROM sku_level
ORDER BY 
  sort_level, 
  CASE year_bucket 
    WHEN 'ALL' THEN 0
    WHEN '1년차' THEN 1
    WHEN '2년차' THEN 2
    WHEN '3년차 이상' THEN 3
    WHEN 'SS 과시즌' THEN 4
    ELSE 99
  END,
  cat2 NULLS FIRST, 
  tag_stock_asof DESC,
  prdt_cd NULLS FIRST, 
  color_cd NULLS FIRST, 
  size_cd NULLS FIRST;
