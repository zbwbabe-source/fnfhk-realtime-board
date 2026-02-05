-- ============================================================
-- XE1 매장 데이터 확인 쿼리
-- ============================================================
-- 아래 쿼리를 순서대로 Snowflake에서 실행해주세요
-- ============================================================

-- 📌 쿼리 1: XE1 매장 데이터가 있는지 확인
SELECT 
  LOCAL_SHOP_CD,
  BRD_CD,
  COUNT(*) AS record_count,
  MIN(SALE_DT) AS first_sale_date,
  MAX(SALE_DT) AS last_sale_date,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  LOCAL_SHOP_CD = 'XE1'
  AND SALE_DT >= '2025-08-01'
GROUP BY LOCAL_SHOP_CD, BRD_CD;

-- 결과가 없으면 → XE1 매출 데이터가 Snowflake에 없습니다
-- BRD_CD가 'X'가 아니면 → 브랜드 코드가 다릅니다


-- 📌 쿼리 2: Discovery(X) 브랜드 모든 매장 확인 (2026년 1월)
SELECT 
  LOCAL_SHOP_CD AS shop_code,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD
ORDER BY LOCAL_SHOP_CD;

-- 이 결과에 XE1이 있는지 확인하세요


-- 📌 쿼리 3: XE1과 유사한 코드 검색 (오타 가능성)
SELECT DISTINCT
  LOCAL_SHOP_CD
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  (LOCAL_SHOP_CD LIKE '%XE%' OR LOCAL_SHOP_CD LIKE '%E1%')
  AND SALE_DT >= '2025-08-01'
ORDER BY LOCAL_SHOP_CD;

-- XE1 대신 다른 코드를 사용하는지 확인


-- 📌 쿼리 4: 홍콩 Discovery 온라인 매장 전체 조회
SELECT 
  LOCAL_SHOP_CD AS shop_code,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  MIN(SALE_DT) AS first_date,
  MAX(SALE_DT) AS last_date
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND LOCAL_SHOP_CD LIKE '%E%'  -- E는 보통 온라인(E-commerce) 의미
  AND SALE_DT >= '2025-08-01'
GROUP BY LOCAL_SHOP_CD
ORDER BY LOCAL_SHOP_CD;


-- 📌 쿼리 5: 2026년 1월 31일 기준 실제 API 쿼리 (디버깅용)
WITH store_sales AS (
  SELECT
    LOCAL_SHOP_CD AS shop_cd,
    
    /* MTD ACT */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE('2026-01-31')) AND TO_DATE('2026-01-31')
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS mtd_act,
    
    /* MTD ACT PY */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE('2026-01-31'))) AND DATEADD(YEAR, -1, TO_DATE('2026-01-31'))
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS mtd_act_py
    
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE
    (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'X'
    AND LOCAL_SHOP_CD IN ('X01', 'XE1')
    AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE('2026-01-31'))) AND TO_DATE('2026-01-31')
  GROUP BY LOCAL_SHOP_CD
)
SELECT
  shop_cd,
  mtd_act,
  mtd_act_py,
  CASE
    WHEN mtd_act_py > 0
    THEN (mtd_act / mtd_act_py) * 100
    ELSE 0
  END AS yoy
FROM store_sales
ORDER BY shop_cd;

-- X01만 나오고 XE1이 안 나오면 → XE1 매출 데이터가 없는 것입니다
