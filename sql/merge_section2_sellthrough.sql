-- ============================================================
-- 섹션2: DASH_SEASON_SELLTHROUGH MERGE 쿼리 (참고용)
-- ============================================================
-- Purpose: 당시즌 의류 판매율 집계 (TAG 기준)
-- ⚠️ 주의: 현재 API는 DASH 테이블을 사용하지 않고 직접 SELECT를 실행합니다.
--          이 파일은 향후 배치 작업 참고용입니다.
-- 
-- Input Parameters:
--   :asof_date - 기준일 (영업일 기준)
--   :start_date - 계산 시작일 (시즌 시작일 - 6개월)
--   :region - 'HKMC' or 'TW'
--   :brand - 'M' or 'X' (normalized)
--   :sesn - 시즌 코드 (예: '25F', '26S')
--   :all_store_codes - HKMC 전체 매장 코드 리스트 (warehouse 포함)
--   :store_codes - 일반 매장 코드 리스트 (warehouse 제외)
--   :apparel_categories - 의류 카테고리 소분류 코드 리스트 ('DP','LG','PT',...)
-- ============================================================
-- ⚠️ 핵심 로직: 
-- 1. 판매율 = 판매 / (판매 + 재고) × 100
-- 2. 재고 STOCK_DT = asof_date + 1 (적재일 기준)
-- 3. 판매 SALE_DT = asof_date (영업일 기준, +1 금지)
-- 4. SESN 필터 유지 (해당 시즌만)
-- 5. 판매 기간: 시즌 시작일 - 6개월 ~ asof_date
-- 6. 카테고리 필터: 의류만 (category.csv 기준)
-- ============================================================

MERGE INTO SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH AS target
USING (
    WITH ending_stock AS (
        -- 기말재고: asof_date + 1 (적재일), SESN 필터 적용, warehouse 포함
        SELECT 
            PRDT_CD,
            ANY_VALUE(PART_CD) AS PART_CD,
            SUM(TAG_STOCK_AMT) AS stock_tag
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE 
            (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = :brand
            AND SESN = :sesn
            AND LOCAL_SHOP_CD IN (:all_store_codes)
            AND STOCK_DT = DATEADD(DAY, 1, :asof_date)
        GROUP BY PRDT_CD
    ),
    sales_agg AS (
        -- 판매: 시즌 시작일 - 6개월 ~ asof_date (영업일), SESN 필터 적용, warehouse 제외
        SELECT 
            PRDT_CD,
            ANY_VALUE(PART_CD) AS PART_CD,
            SUM(TAG_SALE_AMT) AS sales_tag
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE 
            (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = :brand
            AND SESN = :sesn
            AND LOCAL_SHOP_CD IN (:store_codes)
            AND SALE_DT BETWEEN :start_date AND :asof_date
        GROUP BY PRDT_CD
    )
    SELECT 
        :asof_date AS asof_date,
        :region AS region,
        :brand AS brand,
        :sesn AS sesn,
        COALESCE(s.PRDT_CD, e.PRDT_CD) AS prdt_cd,
        SUBSTR(COALESCE(e.PART_CD, s.PART_CD), 3, 2) AS category,
        COALESCE(s.sales_tag, 0) AS sales_tag,
        COALESCE(e.stock_tag, 0) AS stock_tag,
        CASE 
            WHEN (COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0)) > 0 
            THEN (COALESCE(s.sales_tag, 0) / (COALESCE(s.sales_tag, 0) + COALESCE(e.stock_tag, 0))) * 100
            ELSE 0 
        END AS sellthrough_pct
    FROM sales_agg s
    FULL OUTER JOIN ending_stock e 
        ON s.PRDT_CD = e.PRDT_CD
    WHERE COALESCE(s.PRDT_CD, e.PRDT_CD) IS NOT NULL
        AND SUBSTR(COALESCE(e.PART_CD, s.PART_CD), 3, 2) IN (:apparel_categories)
) AS source
ON target.asof_date = source.asof_date 
   AND target.region = source.region 
   AND target.brand = source.brand 
   AND target.sesn = source.sesn 
   AND target.prdt_cd = source.prdt_cd
WHEN MATCHED THEN 
    UPDATE SET 
        target.category = source.category,
        target.sales_tag = source.sales_tag,
        target.stock_tag = source.stock_tag,
        target.sellthrough_pct = source.sellthrough_pct,
        target.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN 
    INSERT (
        asof_date, region, brand, sesn, prdt_cd,
        category, sales_tag, stock_tag, sellthrough_pct,
        created_at, updated_at
    )
    VALUES (
        source.asof_date, source.region, source.brand, source.sesn, source.prdt_cd,
        source.category, source.sales_tag, source.stock_tag, source.sellthrough_pct,
        CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
    );
