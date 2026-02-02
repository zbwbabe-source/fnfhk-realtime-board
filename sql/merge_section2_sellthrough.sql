-- ============================================================
-- 섹션2: DASH_SEASON_SELLTHROUGH MERGE 쿼리
-- ============================================================
-- Purpose: 당시즌 판매율 집계 (TAG 기준)
-- Input Parameters:
--   :asof_date - 기준일 (어제)
--   :region - 'HKMC' or 'TW'
--   :brand - 'M' or 'X' (normalized)
--   :sesn - 시즌 코드 (예: '25F', '26S')
--   :all_store_codes - HKMC 전체 매장 코드 리스트 (warehouse 포함) - inbound 계산용
--   :store_codes - 일반 매장 코드 리스트 (warehouse 제외) - sales 계산용
-- ============================================================
-- ⚠️ 중요: 이 방식은 매장 간 재고 이동(transfer)도 positive delta로 잡히므로
-- '외부/본사 입고'만이 아닌 '재고 유입 이벤트' 기준 inbound로 해석해야 함
-- ============================================================

MERGE INTO SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH AS target
USING (
    WITH inbound_calc AS (
        -- Inbound 계산: HKMC 전체 매장 (warehouse 포함), TAG 기준, Delta 방식
        SELECT 
            LOCAL_SHOP_CD,
            PRDT_CD,
            PART_CD,
            TAG_STOCK_AMT,
            STOCK_DT,
            LAG(TAG_STOCK_AMT, 1, TAG_STOCK_AMT) 
              OVER (PARTITION BY LOCAL_SHOP_CD, PRDT_CD ORDER BY STOCK_DT) AS prev_stock,
            TAG_STOCK_AMT - LAG(TAG_STOCK_AMT, 1, TAG_STOCK_AMT) 
              OVER (PARTITION BY LOCAL_SHOP_CD, PRDT_CD ORDER BY STOCK_DT) AS delta
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE 
            (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = :brand
            AND SESN = :sesn
            AND LOCAL_SHOP_CD IN (:all_store_codes)   -- ✅ 변경: 전체 매장 포함
            AND STOCK_DT <= :asof_date
    ),
    inbound_agg AS (
        SELECT 
            PRDT_CD,
            ANY_VALUE(PART_CD) AS PART_CD,
            SUM(GREATEST(delta, 0)) AS inbound_tag  -- positive delta만 합산
        FROM inbound_calc
        GROUP BY PRDT_CD
    ),
    sales_agg AS (
        -- Sales 계산: 일반 매장 (Warehouse 제외), TAG 기준
        SELECT 
            PRDT_CD,
            SUM(TAG_SALE_AMT) AS sales_tag
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE 
            (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = :brand
            AND SESN = :sesn
            AND LOCAL_SHOP_CD IN (:store_codes)       -- ✅ 기존 유지: warehouse 제외
            AND SALE_DT <= :asof_date
        GROUP BY PRDT_CD
    )
    SELECT 
        :asof_date AS asof_date,
        :region AS region,
        :brand AS brand,
        :sesn AS sesn,
        COALESCE(i.PRDT_CD, s.PRDT_CD) AS prdt_cd,
        SUBSTR(i.PART_CD, 3, 2) AS category,
        COALESCE(i.inbound_tag, 0) AS inbound_tag,
        COALESCE(s.sales_tag, 0) AS sales_tag,
        CASE 
            WHEN COALESCE(i.inbound_tag, 0) > 0 
            THEN (COALESCE(s.sales_tag, 0) / i.inbound_tag) * 100
            ELSE 0 
        END AS sellthrough
    FROM inbound_agg i
    FULL OUTER JOIN sales_agg s 
        ON i.PRDT_CD = s.PRDT_CD
    WHERE COALESCE(i.PRDT_CD, s.PRDT_CD) IS NOT NULL
) AS source
ON target.asof_date = source.asof_date 
   AND target.region = source.region 
   AND target.brand = source.brand 
   AND target.sesn = source.sesn 
   AND target.prdt_cd = source.prdt_cd
WHEN MATCHED THEN 
    UPDATE SET 
        target.category = source.category,
        target.inbound_tag = source.inbound_tag,
        target.sales_tag = source.sales_tag,
        target.sellthrough = source.sellthrough,
        target.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN 
    INSERT (
        asof_date, region, brand, sesn, prdt_cd,
        category, inbound_tag, sales_tag, sellthrough,
        created_at, updated_at
    )
    VALUES (
        source.asof_date, source.region, source.brand, source.sesn, source.prdt_cd,
        source.category, source.inbound_tag, source.sales_tag, source.sellthrough,
        CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
    );
