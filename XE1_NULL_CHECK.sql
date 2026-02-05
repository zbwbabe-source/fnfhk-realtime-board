-- ============================================================
-- XE1 매장코드 문제 확인 쿼리
-- ============================================================

-- 📌 쿼리 1: LOCAL_SHOP_CD가 비어있거나 NULL인 데이터 확인
SELECT 
  LOCAL_SHOP_CD,
  COALESCE(LOCAL_SHOP_CD, 'NULL') AS shop_cd_check,
  LENGTH(LOCAL_SHOP_CD) AS code_length,
  BRD_CD,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  MIN(SALE_DT) AS first_date,
  MAX(SALE_DT) AS last_date,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
  AND (LOCAL_SHOP_CD IS NULL OR LOCAL_SHOP_CD = '' OR TRIM(LOCAL_SHOP_CD) = '')
GROUP BY LOCAL_SHOP_CD, BRD_CD;


-- 📌 쿼리 2: Discovery(X) 브랜드 전체 매장 상세 (NULL 포함)
SELECT 
  CASE 
    WHEN LOCAL_SHOP_CD IS NULL THEN '[NULL]'
    WHEN TRIM(LOCAL_SHOP_CD) = '' THEN '[EMPTY]'
    ELSE LOCAL_SHOP_CD
  END AS shop_code_display,
  LOCAL_SHOP_CD AS original_code,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  SUM(ACT_SALE_AMT) AS total_sales,
  COUNT(*) AS record_count
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD
ORDER BY total_sales DESC;


-- 📌 쿼리 3: 빈 매장코드의 상세 데이터 샘플 (최근 10건)
SELECT 
  LOCAL_SHOP_CD,
  SALE_DT,
  BRD_CD,
  PRDT_CD,
  ACT_SALE_AMT,
  TAG_SALE_AMT,
  SALE_QTY
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
  AND (LOCAL_SHOP_CD IS NULL OR LOCAL_SHOP_CD = '' OR TRIM(LOCAL_SHOP_CD) = '')
ORDER BY SALE_DT DESC
LIMIT 10;


-- 📌 쿼리 4: XE1이 실제로 존재하는지 직접 확인
SELECT 
  LOCAL_SHOP_CD,
  BRD_CD,
  COUNT(*) AS record_count,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  LOCAL_SHOP_CD = 'XE1'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD, BRD_CD;

-- 결과 없으면 → 'XE1'이라는 코드 자체가 없음
