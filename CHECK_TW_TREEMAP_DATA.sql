-- TW 리전 1월 의류 데이터 존재 여부 확인

-- 1. 2026년 1월 데이터 확인 (25F)
SELECT 
  '2026-01 (25F)' AS period,
  COUNT(*) AS record_count,
  COUNT(DISTINCT SALE_DT) AS day_count,
  COUNT(DISTINCT LOCAL_SHOP_CD) AS shop_count,
  SUM(TAG_SALE_AMT) AS total_sales_twd,
  SUM(TAG_SALE_AMT) * 0.2475 AS total_sales_hkd
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'M'
  AND SESN = '25F'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
  AND LOCAL_SHOP_CD IN (
    'T01','T02','T03','T06','T08','T10','T11','T12','T13','T14','T16','T17','T18',
    'D01','D03','D04','DE1','DE2',
    'TU1','TU2','TU3','TE1','TE2','TE3'
  )

UNION ALL

-- 2. 2025년 1월 데이터 확인 (24F)
SELECT 
  '2025-01 (24F)' AS period,
  COUNT(*) AS record_count,
  COUNT(DISTINCT SALE_DT) AS day_count,
  COUNT(DISTINCT LOCAL_SHOP_CD) AS shop_count,
  SUM(TAG_SALE_AMT) AS total_sales_twd,
  SUM(TAG_SALE_AMT) * 0.2475 AS total_sales_hkd
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'M'
  AND SESN = '24F'
  AND SALE_DT BETWEEN '2025-01-01' AND '2025-01-31'
  AND LOCAL_SHOP_CD IN (
    'T01','T02','T03','T06','T08','T10','T11','T12','T13','T14','T16','T17','T18',
    'D01','D03','D04','DE1','DE2',
    'TU1','TU2','TU3','TE1','TE2','TE3'
  )

UNION ALL

-- 3. 의류 카테고리만 (2026-01, 25F)
SELECT 
  '2026-01 (25F) Apparel Only' AS period,
  COUNT(*) AS record_count,
  COUNT(DISTINCT SALE_DT) AS day_count,
  COUNT(DISTINCT LOCAL_SHOP_CD) AS shop_count,
  SUM(TAG_SALE_AMT) AS total_sales_twd,
  SUM(TAG_SALE_AMT) * 0.2475 AS total_sales_hkd
FROM SAP_FNF.DW_HMD_SALE_D
WHERE 
  (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = 'M'
  AND SESN = '25F'
  AND SALE_DT BETWEEN '2026-01-01' AND '2026-01-31'
  AND LOCAL_SHOP_CD IN (
    'T01','T02','T03','T06','T08','T10','T11','T12','T13','T14','T16','T17','T18',
    'D01','D03','D04','DE1','DE2',
    'TU1','TU2','TU3','TE1','TE2','TE3'
  )
  AND SUBSTR(PART_CD, 3, 2) IN ('DP','LG','PT','SK','SM','SP','TP','WP','BS','HD','KP','MT','OP','PQ','TK','TR','TS','WS','DJ','DK','FD','JP','KC','WJ','S6','DS','DD','DR','RS','SW','TO','DV','JK','KT','PD','VT','DT','S2','S1','BV','ZT','CT','LE','S5','RL','SS','TL','BR');
