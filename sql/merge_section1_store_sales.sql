-- ============================================================
-- 섹션1: DASH_STORE_MTD_SALES MERGE 쿼리
-- ============================================================
-- Purpose: 매장별 MTD 매출 집계 (ACT 기준)
-- Input Parameters:
--   :asof_date - 기준일 (어제)
--   :region - 'HKMC' or 'TW'
--   :brand - 'M' or 'X' (normalized)
--   :store_codes - 매장 코드 리스트 (Warehouse 제외)
-- ============================================================

MERGE INTO SAP_FNF.DASH.DASH_STORE_MTD_SALES AS target
USING (
    WITH store_sales AS (
        SELECT 
            :asof_date AS asof_date,
            :region AS region,
            :brand AS brand,
            LOCAL_SHOP_CD AS shop_cd,
            -- MTD ACT (이번 달 1일 ~ asof_date)
            SUM(
                CASE 
                    WHEN SALES_DT BETWEEN DATE_TRUNC('MONTH', :asof_date) AND :asof_date
                    THEN ACT_SALE_AMT 
                    ELSE 0 
                END
            ) AS mtd_act,
            -- MTD ACT PY (작년 동기간)
            SUM(
                CASE 
                    WHEN SALES_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', :asof_date)) 
                         AND DATEADD(YEAR, -1, :asof_date)
                    THEN ACT_SALE_AMT 
                    ELSE 0 
                END
            ) AS mtd_act_py
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE 
            -- Brand normalize: 'M' or 'I' -> 'M', 'X' -> 'X'
            (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = :brand
            AND LOCAL_SHOP_CD IN (:store_codes)
            AND (
                SALES_DT BETWEEN DATE_TRUNC('MONTH', :asof_date) AND :asof_date
                OR SALES_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', :asof_date)) 
                            AND DATEADD(YEAR, -1, :asof_date)
            )
        GROUP BY LOCAL_SHOP_CD
    )
    SELECT 
        s.asof_date,
        s.region,
        s.brand,
        s.shop_cd,
        s.mtd_act,
        s.mtd_act_py,
        CASE 
            WHEN s.mtd_act_py > 0 THEN ((s.mtd_act - s.mtd_act_py) / s.mtd_act_py) * 100
            ELSE 0 
        END AS yoy
    FROM store_sales s
) AS source
ON target.asof_date = source.asof_date 
   AND target.region = source.region 
   AND target.brand = source.brand 
   AND target.shop_cd = source.shop_cd
WHEN MATCHED THEN 
    UPDATE SET 
        target.mtd_act = source.mtd_act,
        target.mtd_act_py = source.mtd_act_py,
        target.yoy = source.yoy,
        target.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN 
    INSERT (
        asof_date, region, brand, shop_cd, 
        target_mth, mtd_act, mtd_act_py, yoy,
        created_at, updated_at
    )
    VALUES (
        source.asof_date, source.region, source.brand, source.shop_cd,
        0, source.mtd_act, source.mtd_act_py, source.yoy,
        CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
    );
