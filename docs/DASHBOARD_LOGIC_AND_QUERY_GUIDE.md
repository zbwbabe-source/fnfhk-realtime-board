# FNF HKMCTW Realtime Dashboard Logic & Query Guide

이 문서는 현재 코드 기준으로 대시보드의 핵심 로직, API 흐름, Snowflake 쿼리 구조, 캐시/스냅샷 전략을 정리한 운영/개발 가이드입니다.

## 1) 시스템 개요

대시보드는 3개 섹션 데이터를 조합합니다.

1. `Section1`: 매장 매출/목표/진척/YoY + 시즌/카테고리 카드
2. `Section2`: 당시즌 판매율(Sell-through), 카테고리/품번 상세, 트리맵
3. `Section3`: 과시즌 재고 소진(연차/카테고리/SKU, 정체재고, 재고일수)

핵심 원칙:

1. API는 Redis 스냅샷 우선 조회, MISS 시 Snowflake 쿼리 실행
2. Cron이 매일 스냅샷을 미리 생성해 조회 지연을 줄임
3. TW는 환율 환산(TWD -> HKD)을 적용

---

## 2) 주요 엔드포인트

1. `GET /api/section1/store-sales`
2. `GET /api/section1/monthly-trend`
3. `GET /api/section2/sellthrough`
4. `GET /api/section2/treemap`
5. `GET /api/section3/old-season-inventory`
6. `POST /api/insights/dashboard` (Daily Highlight/전략 문구)
7. `POST /api/insights/summary` (Executive Summary)

관련 라우트:

1. `app/api/section1/store-sales/route.ts`
2. `app/api/section1/monthly-trend/route.ts`
3. `app/api/section2/sellthrough/route.ts`
4. `app/api/section2/treemap/route.ts`
5. `app/api/section3/old-season-inventory/route.ts`
6. `app/api/insights/dashboard/route.ts`

---

## 3) 공통 비즈니스 규칙

### 3.1 시즌 코드

`lib/date-utils.ts`의 `getSeasonCode()` 기준:

1. 9~12월: `YYF`
2. 1~2월: `(YY-1)F`
3. 3~8월: `YYS`

예:

1. `2026-02-28 -> 25F`
2. `2026-03-01 -> 26S`

### 3.2 브랜드/매장 필터

1. 브랜드 `M`은 쿼리에서 `BRD_CD IN ('M','I')`를 `M`으로 통합 처리
2. 지역/브랜드별 허용 매장은 `store-utils`의 마스터에서 선별
3. 대부분 Warehouse는 제외(Section별 예외 있음)

### 3.3 환율 처리(TW)

1. TW는 기간별 환율로 TWD -> HKD 환산
2. 유틸: `lib/exchange-rate-utils.ts`

---

## 4) Section1 로직

구현: `lib/section1/store-sales.ts`

### 4.1 매장 실적 쿼리(요약)

단일 쿼리에서 MTD/YTD/전년/전월을 계산합니다.

```sql
WITH store_sales AS (
  SELECT
    LOCAL_SHOP_CD AS shop_cd,
    SUM(CASE WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) AS mtd_act,
    SUM(CASE WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?)) THEN ACT_SALE_AMT ELSE 0 END) AS mtd_act_py,
    SUM(CASE WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) AS ytd_act,
    ...
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (...)
  GROUP BY LOCAL_SHOP_CD
)
```

추가 처리:

1. 목표(target.json) 조인/누적
2. 할인율(`TAG` 대비) 및 전년 대비 차이 계산
3. 채널별 subtotal + 지역 total 생성

### 4.2 시즌 카테고리 카드 집계

동일 파일의 `seasonCategoryQuery`로 시즌/카테고리 메트릭을 만듭니다.

```sql
SELECT
  SESN AS sesn,
  SUBSTR(PART_CD, 3, 2) AS category_small,
  SUM(...) AS mtd_act_ty,
  SUM(...) AS ytd_act_ty,
  SUM(...) AS mtd_act_ly,
  SUM(...) AS ytd_act_ly
FROM SAP_FNF.DW_HMD_SALE_D
WHERE ...
GROUP BY SESN, category_small
```

메트릭 구성:

1. `currentSeason`, `nextSeason`, `pastSeason` (의류 기준)
2. `hat`, `shoes`, `bag`

### 4.3 카드 표시 규칙(최근 변경 포함)

`app/dashboard/components/Section1Card.tsx`

1. 차시즌 판매(`nextSeason`)가 `> 0`: 차시즌 카드 표시, `bag` 숨김
2. 차시즌 판매가 `0`: 차시즌 카드 숨김, `bag` 표시

---

## 5) Section1 Monthly Trend

구현: `lib/section1/monthly-trend.ts`

최근 12개월 월별 채널 집계를 계산합니다.

```sql
WITH ty_monthly AS (
  SELECT TO_CHAR(SALE_DT, 'YYYY-MM') AS month,
         SUM(CASE WHEN LOCAL_SHOP_CD IN (...) THEN ACT_SALE_AMT ELSE 0 END) AS hk_normal,
         ...
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE ...
  GROUP BY TO_CHAR(SALE_DT, 'YYYY-MM')
),
ly_monthly AS (
  SELECT TO_CHAR(DATEADD(YEAR, 1, SALE_DT), 'YYYY-MM') AS month,
         SUM(ACT_SALE_AMT) AS total_sales_ly
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE ...
  GROUP BY TO_CHAR(DATEADD(YEAR, 1, SALE_DT), 'YYYY-MM')
)
SELECT ...
```

---

## 6) Section2 Sell-through 로직

구현: `lib/section2/sellthrough.ts`

핵심 계산식:

1. `Inbound = Sales + EndingStock`
2. `Sellthrough = Sales / Inbound * 100`

### 6.1 Header 쿼리 구조

TY/LY 각각에 대해 매출과 말재고를 구하고 YoY 지표를 계산합니다.

```sql
WITH
sales_ty AS (...),
stock_ty AS (...), -- DW_HMD_STOCK_SNAP_D 또는 PREP_HMD_STOCK
sales_ly AS (...),
stock_ly AS (...)
SELECT
  sales_ty, stock_ty, (sales_ty + stock_ty) AS inbound_ty,
  sales_ly, stock_ly, (sales_ly + stock_ly) AS inbound_ly,
  sellthrough_ty, sellthrough_ly
FROM ...
```

### 6.2 재고 데이터 소스 분기

기준일에 따라 재고 소스를 분기합니다.

1. `date < 2025-10-01`: `PREP_HMD_STOCK`
2. 그 외: `DW_HMD_STOCK_SNAP_D`

### 6.3 category_filter

1. `clothes`: CSV 기반 의류 소분류 코드만 포함
2. `all`: 전체 카테고리

API 레벨에서 스냅샷 키도 분리합니다.

1. `sellthrough:clothes`
2. `sellthrough:all`

---

## 7) Section2 Treemap 로직

구현: `lib/section2/treemap.ts`

`mode`에 따라 기간이 다릅니다.

1. `monthly`: 월초 ~ asof_date
2. `ytd`: 시즌 시작일 ~ asof_date

쿼리 구조:

```sql
WITH
sales_ty AS (
  SELECT SUBSTR(PART_CD, 3, 2) AS category_small, SUM(TAG_SALE_AMT), SUM(ACT_SALE_AMT)
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE ...
  GROUP BY category_small
),
sales_ly AS (
  SELECT SUBSTR(PART_CD, 3, 2) AS category_small, SUM(TAG_SALE_AMT), SUM(ACT_SALE_AMT)
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE ...
  GROUP BY category_small
)
SELECT ... FULL OUTER JOIN ...
```

후처리:

1. 소분류 -> 중분류 -> 대분류 롤업
2. 가중 할인율/YoY 계산
3. 트리맵 표시용 비중 산출

---

## 8) Section3 과시즌 로직

구현: `lib/section3Query.ts`

Section3는 복수 CTE 기반 대형 쿼리로, 다음을 계산합니다.

1. 기준일/전월말/시즌타입(FW/SS) 파라미터
2. 과시즌 연차 버킷(1년차, 2년차, 3년차+)
3. 기초재고/현재재고/정체재고/소진재고
4. 할인율/재고일수
5. 연차/카테고리/SKU 계층 결과

핵심 CTE 시작부:

```sql
WITH
region_shop AS (...),
PARAM AS (
  SELECT
    CAST(? AS DATE) AS ASOF_DATE,
    LAST_DAY(DATEADD(MONTH, -1, CAST(? AS DATE))) AS PREV_MONTH_END_DT,
    CASE WHEN MONTH(CAST(? AS DATE)) IN (9,10,11,12,1,2) THEN 'F' ELSE 'S' END AS CUR_TYP,
    ...
),
SEASON_BUCKETS AS (...),
BASE_STOCK_DT_RESOLVED AS (...),
CURR_STOCK_DT_RESOLVED AS (...)
...
```

중요 출력:

1. `header.stagnant_ratio`
2. `header.prev_month_stagnant_ratio`
3. `header.inv_days`

---

## 9) 캐시/스냅샷 전략

### 9.1 공통 스냅샷

유틸: `lib/snapshotCache.ts`

1. `getSnapshot(section, resource, region, brand, date)`
2. `setSnapshot(..., ttl)`
3. 내부 저장 형식은 압축(base64 + gzip)

### 9.2 Section3 전용 캐시

Section3는 전용 키/스키마 버전 사용:

1. 키 빌더: `lib/section3-cache-key.ts`
2. Redis 직접 저장 + 압축 유틸(`lib/redisSnapshot.ts`)

### 9.3 forceRefresh

일부 API는 `forceRefresh=true` 시 캐시를 건너뛰고 Snowflake 재조회:

1. `section1/store-sales`
2. `section2/sellthrough`
3. `section3/old-season-inventory`

---

## 10) Cron 스냅샷 작업

1. `app/api/cron/section1-snapshot/route.ts`
2. `app/api/cron/section2-snapshot/route.ts`
3. `app/api/cron/section3-snapshot/route.ts`

공통 패턴:

1. `CRON_SECRET` 검증
2. 대상 날짜(`어제` 기준) N일 생성
3. Region(HKMC/TW) x Brand(M/X) x Resource 조합 순회
4. Snowflake 조회 후 Redis snapshot 저장

주요 환경변수:

1. `CRON_SECRET`
2. `SECTION_SNAPSHOT_DAYS`, `SECTION_CRON_PARALLEL`
3. `SECTION3_SNAPSHOT_DAYS`, `SECTION3_CRON_PARALLEL`

---

## 11) 인사이트(문장 생성) 로직

### 11.1 Daily Highlight

`POST /api/insights/dashboard`

입력 지표:

1. Section1 YoY(MTD/YTD)
2. Section2 sell-through
3. Section3 old stock/inv days/stagnant ratio

출력:

1. `summaryLine`, `blocks`, `actions(HKMC-1..TW-2)`

최근 반영:

1. `정체재고비중` 문구에 `전월말 대비 ±x.x%p` 포함
2. `stagnantRatioChange`가 입력 시그니처/캐시에 반영됨

### 11.2 Executive Summary

`POST /api/insights/summary`

Section1/2/3 요약 지표를 LLM 프롬프트에 넣어 문단 + 키 인사이트를 생성합니다.

---

## 12) 운영 시 점검 포인트

1. 시즌 경계일(2/28, 3/1, 8/31, 9/1)에서 시즌코드/기준일 정상 여부
2. Section2 재고 소스 분기(`2025-10-01`) 이후 데이터 정합성
3. Section3 `stagnant_ratio` vs `prev_month_stagnant_ratio` 일관성
4. Redis 스냅샷 HIT율과 Cron 실패율(ops 로그)
5. TW 환율 기간(`period`) 계산과 환산 일치 여부

