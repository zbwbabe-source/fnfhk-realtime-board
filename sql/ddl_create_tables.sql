-- ============================================================
-- HKMC Dashboard - Snowflake DDL Scripts
-- ============================================================
-- Purpose: DASH 집계 테이블 생성 및 초기화
-- Database: SAP_FNF
-- Schema: DASH
-- ============================================================

-- 1. DASH 스키마 생성 (없으면)
CREATE SCHEMA IF NOT EXISTS SAP_FNF.DASH;

-- 2. 섹션1: 매장별 MTD 매출 집계 테이블
DROP TABLE IF EXISTS SAP_FNF.DASH.DASH_STORE_MTD_SALES;

CREATE TABLE SAP_FNF.DASH.DASH_STORE_MTD_SALES (
    asof_date DATE NOT NULL,
    region STRING NOT NULL,           -- 'HKMC' or 'TW'
    brand STRING NOT NULL,            -- 'M' or 'X'
    country STRING NOT NULL,          -- 'HK', 'MC', or 'TW'
    channel STRING NOT NULL,          -- '정상', '아울렛', '온라인'
    shop_cd STRING NOT NULL,
    target_mth NUMBER(18, 2) DEFAULT 0,
    mtd_act NUMBER(18, 2) DEFAULT 0,
    mtd_act_py NUMBER(18, 2) DEFAULT 0,
    yoy NUMBER(18, 2) DEFAULT 0,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (asof_date, region, brand, shop_cd)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_store_mtd_sales_date 
    ON SAP_FNF.DASH.DASH_STORE_MTD_SALES(asof_date);
CREATE INDEX IF NOT EXISTS idx_store_mtd_sales_region_brand 
    ON SAP_FNF.DASH.DASH_STORE_MTD_SALES(region, brand);

-- 3. 섹션2: 당시즌 판매율 집계 테이블
DROP TABLE IF EXISTS SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH;

CREATE TABLE SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH (
    asof_date DATE NOT NULL,
    region STRING NOT NULL,           -- 'HKMC' or 'TW'
    brand STRING NOT NULL,            -- 'M' or 'X'
    sesn STRING NOT NULL,             -- '25F', '26S', etc.
    prdt_cd STRING NOT NULL,
    category STRING,                  -- SUBSTR(PART_CD, 3, 2)
    inbound_tag NUMBER(18, 2) DEFAULT 0,
    sales_tag NUMBER(18, 2) DEFAULT 0,
    sellthrough NUMBER(18, 4) DEFAULT 0,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (asof_date, region, brand, sesn, prdt_cd)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_season_sellthrough_date 
    ON SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH(asof_date);
CREATE INDEX IF NOT EXISTS idx_season_sellthrough_region_brand 
    ON SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH(region, brand, sesn);
CREATE INDEX IF NOT EXISTS idx_season_sellthrough_sellthrough 
    ON SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH(sellthrough);

-- ============================================================
-- DDL 완료
-- ============================================================
-- 다음 단계:
-- 1. 이 스크립트를 Snowflake에서 실행
-- 2. /api/cron/daily-aggregate를 통해 데이터 집계 시작
-- ============================================================
