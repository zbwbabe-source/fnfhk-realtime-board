-- TW 리전 1월 의류 YoY 검증 (monthly mode)
-- 2026년 1월 vs 2025년 1월
-- 25F vs 24F 시즌

WITH apparel_categories AS (
  SELECT 'DP' AS cat UNION ALL SELECT 'LG' UNION ALL SELECT 'PT' UNION ALL SELECT 'SK' 
  UNION ALL SELECT 'SM' UNION ALL SELECT 'SP' UNION ALL SELECT 'TP' UNION ALL SELECT 'WP'
  UNION ALL SELECT 'BS' UNION ALL SELECT 'HD' UNION ALL SELECT 'KP' UNION ALL SELECT 'MT' 
  UNION ALL SELECT 'OP' UNION ALL SELECT 'PQ' UNION ALL SELECT 'TK' UNION ALL SELECT 'TR' 
  UNION ALL SELECT 'TS' UNION ALL SELECT 'WS'
  UNION ALL SELECT 'DJ' UNION ALL SELECT 'DK' UNION ALL SELECT 'FD' UNION ALL SELECT 'JP' 
  UNION ALL SELECT 'KC' UNION ALL SELECT 'WJ' UNION ALL SELECT 'S6'
  UNION ALL SELECT 'DS' UNION ALL SELECT 'DD' UNION ALL SELECT 'DR' UNION ALL SELECT 'RS' 
  UNION ALL SELECT 'SW' UNION ALL SELECT 'TO' UNION ALL SELECT 'DV' UNION ALL SELECT 'JK' 
  UNION ALL SELECT 'KT' UNION ALL SELECT 'PD' UNION ALL SELECT 'VT'
  UNION ALL SELECT 'DT' UNION ALL SELECT 'S2' UNION ALL SELECT 'S1' UNION ALL SELECT 'BV' 
  UNION ALL SELECT 'ZT' UNION ALL SELECT 'CT' UNION ALL SELECT 'LE' UNION ALL SELECT 'S5' 
  UNION ALL SELECT 'RL' UNION ALL SELECT 'SS' UNION ALL SELECT 'TL' UNION ALL SELECT 'BR'
),
-- 당년 (2026년 1월, 25F)
ty_sales AS (
  SELECT 
    SUBSTR(PART_CD, 3, 2) AS category_small,
    SUM(TAG_SALE_AMT) AS sales_tag_ty,
    SUM(VAT_EXC_ACT_SALE_AMT) AS sales_act_ty
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
  GROUP BY category_small
),
-- 전년 (2025년 1월, 24F)
ly_sales AS (
  SELECT 
    SUBSTR(PART_CD, 3, 2) AS category_small,
    SUM(TAG_SALE_AMT) AS sales_tag_ly,
    SUM(VAT_EXC_ACT_SALE_AMT) AS sales_act_ly
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
  GROUP BY category_small
),
-- 대분류별 집계
large_category_map AS (
  SELECT 
    COALESCE(ty.category_small, ly.category_small) AS category_small,
    COALESCE(ty.sales_act_ty, 0) AS sales_act_ty,
    COALESCE(ly.sales_act_ly, 0) AS sales_act_ly,
    CASE 
      WHEN COALESCE(ly.sales_act_ly, 0) > 0 
      THEN (COALESCE(ty.sales_act_ty, 0) / COALESCE(ly.sales_act_ly, 0)) * 100
      ELSE NULL 
    END AS yoy
  FROM ty_sales ty
  FULL OUTER JOIN ly_sales ly 
    ON ty.category_small = ly.category_small
  WHERE COALESCE(ty.category_small, ly.category_small) IN (SELECT cat FROM apparel_categories)
)

SELECT 
  '의류 전체' AS category,
  SUM(sales_act_ty) * 0.2475 AS total_sales_ty_hkd,  -- 환율 적용
  SUM(sales_act_ly) * 0.2475 AS total_sales_ly_hkd,  -- 환율 적용
  CASE 
    WHEN SUM(sales_act_ly) > 0 
    THEN (SUM(sales_act_ty) / SUM(sales_act_ly)) * 100 
    ELSE NULL 
  END AS yoy_pct,
  COUNT(*) AS category_count
FROM large_category_map
WHERE sales_act_ty > 0 OR sales_act_ly > 0

UNION ALL

-- 카테고리별 상세
SELECT 
  category_small,
  sales_act_ty * 0.2475,
  sales_act_ly * 0.2475,
  yoy,
  1
FROM large_category_map
WHERE sales_act_ty > 0 OR sales_act_ly > 0
ORDER BY total_sales_ty_hkd DESC;
