-- ============================================================
-- XE1 매장 매출 데이터 확인 (간단 버전)
-- ============================================================
-- 이 쿼리를 Snowflake에서 실행해주세요
-- ============================================================

-- 1. XE1 매장 데이터가 있는지 확인 (최근 6개월)
SELECT 
  LOCAL_SHOP_CD,
  BRD_CD,
  COUNT(*) AS record_count,
  MIN(SALE_DT) AS first_date,
  MAX(SALE_DT) AS last_date,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  LOCAL_SHOP_CD = 'XE1'
  AND SALE_DT >= '2025-08-01'
GROUP BY LOCAL_SHOP_CD, BRD_CD;

-- 결과가 없으면 → XE1 매장의 매출 데이터가 Snowflake에 없습니다.
-- BRD_CD가 'X'가 아니면 → 브랜드 코드가 잘못되었습니다.

-- 2. Discovery 브랜드(X) 전체 매장 리스트 확인
SELECT DISTINCT
  LOCAL_SHOP_CD,
  COUNT(*) AS record_count,
  SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  BRD_CD = 'X'
  AND SALE_DT >= '2026-01-01'
GROUP BY LOCAL_SHOP_CD
ORDER BY LOCAL_SHOP_CD;

-- 이 결과에 XE1이 있는지 확인하세요.
-- 없으면 → Snowflake 데이터에 XE1 매출이 적재되지 않은 것입니다.
