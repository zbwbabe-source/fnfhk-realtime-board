-- ============================================================
-- XE1 매장 매출 데이터 확인 쿼리
-- ============================================================
-- Purpose: XE1 매장의 실제 데이터가 Snowflake에 있는지 확인
-- ============================================================

-- 1. XE1 매장의 전체 매출 데이터 확인 (최근 3개월)
SELECT 
  LOCAL_SHOP_CD,
  BRD_CD,
  SALE_DT,
  COUNT(*) AS record_count,
  SUM(ACT_SALE_AMT) AS total_act_sale,
  SUM(TAG_SALE_AMT) AS total_tag_sale
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  LOCAL_SHOP_CD = 'XE1'
  AND SALE_DT >= '2025-11-01'
GROUP BY LOCAL_SHOP_CD, BRD_CD, SALE_DT
ORDER BY SALE_DT DESC
LIMIT 100;

-- 2. XE1 매장의 2026년 1월 MTD 매출 확인
SELECT 
  LOCAL_SHOP_CD,
  BRD_CD,
  DATE_TRUNC('MONTH', SALE_DT) AS sale_month,
  COUNT(*) AS record_count,
  SUM(ACT_SALE_AMT) AS mtd_act,
  SUM(TAG_SALE_AMT) AS mtd_tag
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  LOCAL_SHOP_CD = 'XE1'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD, BRD_CD, DATE_TRUNC('MONTH', SALE_DT);

-- 3. XE1 매장의 BRD_CD 확인 (브랜드 코드가 'X'인지 확인)
SELECT DISTINCT
  LOCAL_SHOP_CD,
  BRD_CD,
  COUNT(*) AS record_count,
  MIN(SALE_DT) AS first_sale_date,
  MAX(SALE_DT) AS last_sale_date
FROM SAP_FNF.DW_HMD_SALE_D
WHERE LOCAL_SHOP_CD = 'XE1'
GROUP BY LOCAL_SHOP_CD, BRD_CD;

-- 4. Discovery(X) 브랜드 전체 매장 확인 (2026-01-31 기준)
SELECT 
  LOCAL_SHOP_CD,
  SUM(ACT_SALE_AMT) AS mtd_act,
  SUM(TAG_SALE_AMT) AS mtd_tag
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD
ORDER BY LOCAL_SHOP_CD;

-- 5. X01 매장과 XE1 매장 비교 (둘 다 Discovery 브랜드)
SELECT 
  LOCAL_SHOP_CD,
  BRD_CD,
  DATE_TRUNC('MONTH', SALE_DT) AS sale_month,
  COUNT(*) AS record_count,
  SUM(ACT_SALE_AMT) AS mtd_act
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  LOCAL_SHOP_CD IN ('X01', 'XE1')
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY LOCAL_SHOP_CD, BRD_CD, DATE_TRUNC('MONTH', SALE_DT)
ORDER BY LOCAL_SHOP_CD;
