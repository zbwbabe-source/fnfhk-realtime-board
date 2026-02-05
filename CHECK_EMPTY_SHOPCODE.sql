-- ============================================================
-- 빈 매장코드 데이터 상세 확인
-- ============================================================

-- 📌 쿼리 1: 빈 매장코드(NULL 또는 공백)의 데이터 확인
SELECT 
  CASE 
    WHEN LOCAL_SHOP_CD IS NULL THEN '[NULL]'
    WHEN TRIM(LOCAL_SHOP_CD) = '' THEN '[EMPTY STRING]'
    ELSE CONCAT('[', LOCAL_SHOP_CD, ']')
  END AS shop_code_display,
  BRD_CD,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  MIN(SALE_DT) AS first_date,
  MAX(SALE_DT) AS last_date,
  SUM(ACT_SALE_AMT) AS total_sales,
  COUNT(*) AS record_count
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
  AND (LOCAL_SHOP_CD IS NULL OR TRIM(LOCAL_SHOP_CD) = '')
GROUP BY LOCAL_SHOP_CD, BRD_CD;


-- 📌 쿼리 2: 모든 Discovery X 브랜드 매장 (NULL 포함, 상세)
SELECT 
  LOCAL_SHOP_CD,
  CASE 
    WHEN LOCAL_SHOP_CD IS NULL THEN 'NULL'
    WHEN TRIM(LOCAL_SHOP_CD) = '' THEN 'EMPTY'
    ELSE 'OK'
  END AS status,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD
ORDER BY total_sales DESC;


-- 📌 쿼리 3: TW 지역 포함 전체 X 브랜드 매장 확인
SELECT 
  LOCAL_SHOP_CD,
  COUNT(DISTINCT SALE_DT) AS sales_days,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD
HAVING LOCAL_SHOP_CD IS NOT NULL 
   AND TRIM(LOCAL_SHOP_CD) != ''
ORDER BY LOCAL_SHOP_CD;
