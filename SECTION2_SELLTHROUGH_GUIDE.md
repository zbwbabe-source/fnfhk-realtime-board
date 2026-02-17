# Section 2: 당시즌 판매율 (Sell-through Analysis)

**작성일**: 2026-02-17  
**버전**: 1.0

---

## 📋 목차

- [개요](#개요)
- [데이터 소스](#데이터-소스)
- [계산 로직](#계산-로직)
- [API 명세](#api-명세)
- [화면 구성](#화면-구성)
- [주요 지표](#주요-지표)
- [쿼리 로직](#쿼리-로직)

---

## 개요

Section 2는 **당시즌 품번별 판매율(Sell-through)**을 분석하는 섹션입니다.

### 주요 기능
- ✅ 시즌별 판매율 분석
- ✅ TOP 10 우수 품번 (판매율 높음)
- ✅ BAD 10 부진 품번 (판매율 낮음)
- ✅ No Inbound 품번 (입고 없는 품번)
- ✅ Treemap 시각화 (카테고리별)
- ✅ 정가(TAG) 기준 집계

### 판매율 정의
```
Sell-through = (판매 수량 / 입고 수량) × 100
```

---

## 데이터 소스

### Primary Tables

#### 1. 판매 데이터 (Sales)
```sql
SAP_FNF.DW_HMD_SALE_D
```

| 컬럼명 | 설명 | 비고 |
|--------|------|------|
| `SALE_DT` | 판매 날짜 | Date |
| `LOCAL_SHOP_CD` | 매장 코드 | String |
| `BRD_CD` | 브랜드 코드 | M/I/X |
| `PART_CD` | 품번 | String (8자리) |
| `TAG_SALE_QTY` | 정가 기준 판매 수량 | Integer |

**대상 매장**: 일반 매장 (Warehouse 제외)

#### 2. 재고 데이터 (Stock)
```sql
SAP_FNF.DW_HMD_STOCK_SNAP_D
```

| 컬럼명 | 설명 | 비고 |
|--------|------|------|
| `BASE_DT` | 재고 스냅샷 날짜 | Date |
| `LOCAL_SHOP_CD` | 매장 코드 | String |
| `BRD_CD` | 브랜드 코드 | M/I/X |
| `PART_CD` | 품번 | String |
| `TAG_INV_QTY` | 정가 기준 재고 수량 | Integer |

**대상 매장**: Main Warehouse만 (WHM, XHM)

---

## 시즌 코드 계산

### 시즌 규칙

| 월 | 시즌 코드 | 설명 |
|----|----------|------|
| 9~12월 | **YYF** | Fall/Winter (예: 2025년 9월 → 25F) |
| 1~2월 | **(YY-1)F** | 전년도 Fall/Winter (예: 2026년 1월 → 25F) |
| 3~8월 | **YYS** | Spring/Summer (예: 2026년 3월 → 26S) |

### 시즌 코드 함수

```typescript
export function calculateSeasonCode(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  let seasonYear: number;
  let seasonType: string;
  
  if (month >= 9 && month <= 12) {
    // 9~12월: 올해 Fall
    seasonYear = year;
    seasonType = 'F';
  } else if (month >= 1 && month <= 2) {
    // 1~2월: 작년 Fall
    seasonYear = year - 1;
    seasonType = 'F';
  } else {
    // 3~8월: 올해 Spring
    seasonYear = year;
    seasonType = 'S';
  }
  
  const yy = String(seasonYear).slice(-2);
  return `${yy}${seasonType}`;
}
```

**예시**:
- 2025-11-15 → **25F**
- 2026-01-20 → **25F**
- 2026-05-10 → **26S**

---

## 계산 로직

### 1. 입고 수량 (Inbound)

**Delta 방식**: 재고 증가분만 입고로 간주

```sql
WITH daily_stock AS (
  SELECT
    BASE_DT,
    PART_CD,
    TAG_INV_QTY,
    LAG(TAG_INV_QTY, 1, 0) OVER (
      PARTITION BY PART_CD 
      ORDER BY BASE_DT
    ) AS prev_qty
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
  WHERE 
    LOCAL_SHOP_CD = 'WHM'  -- Main Warehouse
    AND SUBSTR(PART_CD, 1, 3) = '25F'  -- 시즌 필터
),
inbound_calc AS (
  SELECT
    PART_CD,
    SUM(
      CASE 
        WHEN TAG_INV_QTY > prev_qty 
        THEN TAG_INV_QTY - prev_qty 
        ELSE 0 
      END
    ) AS delta_inbound,
    MIN(TAG_INV_QTY) AS first_stock
  FROM daily_stock
  GROUP BY PART_CD
)
SELECT
  PART_CD,
  delta_inbound + first_stock AS total_inbound
FROM inbound_calc
```

**로직 설명**:
1. 전날 재고량 조회 (LAG 함수)
2. 오늘 재고 > 전날 재고 → 증가분을 입고로 계산
3. 첫 재고 스냅샷도 입고로 포함
4. 합계 = 증가분 합계 + 첫 재고

### 2. 판매 수량 (Sales)

```sql
SELECT
  PART_CD,
  SUM(TAG_SALE_QTY) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE
  LOCAL_SHOP_CD IN ('M01', 'M02', ...)  -- 일반 매장만
  AND SUBSTR(PART_CD, 1, 3) = '25F'      -- 시즌 필터
  AND SALE_DT <= ?                       -- 기준일까지
GROUP BY PART_CD
```

**대상 매장**: Warehouse 제외

### 3. 판매율 (Sell-through)

```sql
SELECT
  i.PART_CD,
  i.total_inbound,
  COALESCE(s.total_sales, 0) AS total_sales,
  CASE 
    WHEN i.total_inbound > 0 
    THEN (COALESCE(s.total_sales, 0) / i.total_inbound) * 100 
    ELSE 0 
  END AS sellthrough
FROM inbound_calc i
LEFT JOIN sales_calc s ON i.PART_CD = s.PART_CD
```

**계산 공식**:
```
Sell-through = (판매 수량 / 입고 수량) × 100
```

### 4. 카테고리 매핑

```sql
LEFT JOIN category_mapping cm ON SUBSTR(i.PART_CD, 4, 3) = cm.cat_cd
```

**카테고리 데이터**: `data/category_mapping.json`

---

## Main Warehouse 매핑

브랜드별로 Main Warehouse가 다름:

| 브랜드 | Warehouse Code | 설명 |
|--------|----------------|------|
| **M** (MLB) | **WHM** | MLB Main Warehouse |
| **X** (Discovery) | **XHM** | Discovery Main Warehouse |

### 쿼리에서 사용

```sql
WHERE LOCAL_SHOP_CD = 
  CASE 
    WHEN ? = 'M' THEN 'WHM'
    WHEN ? = 'X' THEN 'XHM'
  END
```

---

## API 명세

### Endpoint
```
GET /api/section2/sellthrough
```

### Query Parameters
| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `region` | ✅ | 리전 | 'HKMC' or 'TW' |
| `brand` | ✅ | 브랜드 | 'M' or 'X' |
| `date` | ✅ | 기준 날짜 | '2025-02-16' |

### Request Example
```bash
GET /api/section2/sellthrough?region=HKMC&brand=M&date=2025-02-16
```

### Response Schema

```typescript
{
  asof_date: string;          // 기준 날짜
  region: string;             // HKMC or TW
  brand: string;              // M or X
  
  header: {
    sesn: string;             // 시즌 코드 (예: 25F)
    overall_sellthrough: number;  // 전체 판매율
  };
  
  top10: PartRecord[];        // TOP 10 우수 품번
  bad10: PartRecord[];        // BAD 10 부진 품번
  no_inbound: PartRecord[];   // 입고 없는 품번 (판매만 있음)
}
```

### PartRecord Schema

```typescript
{
  part_cd: string;            // 품번 (8자리)
  cat_nm: string;             // 카테고리명
  inbound: number;            // 입고 수량
  sales: number;              // 판매 수량
  sellthrough: number;        // 판매율 (%)
  stock: number;              // 현재 재고
}
```

### Response Example

```json
{
  "asof_date": "2025-02-16",
  "region": "HKMC",
  "brand": "M",
  "header": {
    "sesn": "25F",
    "overall_sellthrough": 67.85
  },
  "top10": [
    {
      "part_cd": "25FXXX01",
      "cat_nm": "자켓",
      "inbound": 100,
      "sales": 95,
      "sellthrough": 95.0,
      "stock": 5
    },
    {
      "part_cd": "25FXXX02",
      "cat_nm": "티셔츠",
      "inbound": 200,
      "sales": 180,
      "sellthrough": 90.0,
      "stock": 20
    }
  ],
  "bad10": [
    {
      "part_cd": "25FXXX99",
      "cat_nm": "기타",
      "inbound": 100,
      "sales": 10,
      "sellthrough": 10.0,
      "stock": 90
    }
  ],
  "no_inbound": [
    {
      "part_cd": "25FXXX88",
      "cat_nm": "샘플",
      "inbound": 0,
      "sales": 5,
      "sellthrough": 0,
      "stock": 0
    }
  ]
}
```

---

## 화면 구성

### 접힘/펼침 (Collapsible)

Section 2는 **기본적으로 접혀있음** (Lazy Load)

```typescript
const [isOpen, setIsOpen] = useState(false);
```

**이유**:
- 초기 로딩 속도 개선
- 필요할 때만 데이터 조회

### 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│ Section 2: 당시즌 판매율 (25F)                    [▼ 펼치기]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 전체 판매율: 67.85%                                              │
│                                                                 │
│ TOP 10 우수 품번                                                 │
│ ┌──────┬──────┬────┬────┬────────┬────┐                       │
│ │품번  │카테고리│입고│판매│판매율  │재고│                       │
│ ├──────┼──────┼────┼────┼────────┼────┤                       │
│ │25F001│자켓   │100 │95  │95.0%   │5   │                       │
│ │25F002│티셔츠 │200 │180 │90.0%   │20  │                       │
│ └──────┴──────┴────┴────┴────────┴────┘                       │
│                                                                 │
│ BAD 10 부진 품번                                                 │
│ ...                                                             │
│                                                                 │
│ No Inbound (입고 없는 품번)                                       │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Treemap 시각화

### Endpoint
```
GET /api/section2/treemap
```

### Query Parameters
동일 (region, brand, date)

### Response Schema

```typescript
{
  asof_date: string;
  region: string;
  brand: string;
  sesn: string;
  
  overall: {
    inbound: number;
    sales: number;
    sellthrough: number;
  };
  
  categories: CategoryRecord[];
}
```

### CategoryRecord Schema

```typescript
{
  cat_nm: string;             // 카테고리명
  inbound: number;            // 입고 수량
  sales: number;              // 판매 수량
  sellthrough: number;        // 판매율 (%)
  stock: number;              // 현재 재고
  yoy: number;                // YoY 판매율 비교
}
```

### Treemap 시각화
- **크기**: 입고 수량 (inbound)
- **색상**: 판매율 (sellthrough)
  - 초록색 계열: 70% 이상 (우수)
  - 노란색 계열: 50-70% (보통)
  - 빨간색 계열: 50% 미만 (부진)

---

## 주요 지표

### 1. 전체 판매율 (Overall Sell-through)
**정의**: (전체 판매 수량 / 전체 입고 수량) × 100  
**단위**: %  
**기준**: 
- 70% 이상: 우수
- 50-70%: 보통
- 50% 미만: 개선 필요

### 2. TOP 10 품번
**정의**: 판매율 상위 10개 품번  
**조건**: 입고 수량 > 0  
**정렬**: 판매율 내림차순

### 3. BAD 10 품번
**정의**: 판매율 하위 10개 품번  
**조건**: 입고 수량 > 0  
**정렬**: 판매율 오름차순

### 4. No Inbound 품번
**정의**: 입고는 없는데 판매가 있는 품번  
**원인**: 
- 샘플/테스트 품번
- 반품 후 재판매
- 데이터 오류

---

## 쿼리 로직

### 전체 쿼리 구조

```sql
WITH 
-- 1. 시즌 코드 계산
season_params AS (
  SELECT ? AS sesn  -- 예: 25F
),

-- 2. Main Warehouse 결정
warehouse_params AS (
  SELECT 
    CASE 
      WHEN ? = 'M' THEN 'WHM'
      WHEN ? = 'X' THEN 'XHM'
    END AS warehouse_cd
),

-- 3. 입고 계산 (Delta 방식)
daily_stock AS (
  SELECT
    BASE_DT,
    PART_CD,
    TAG_INV_QTY,
    LAG(TAG_INV_QTY, 1, 0) OVER (
      PARTITION BY PART_CD 
      ORDER BY BASE_DT
    ) AS prev_qty
  FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
  WHERE 
    LOCAL_SHOP_CD = (SELECT warehouse_cd FROM warehouse_params)
    AND SUBSTR(PART_CD, 1, 3) = (SELECT sesn FROM season_params)
    AND BASE_DT <= ?
),

inbound_calc AS (
  SELECT
    PART_CD,
    SUM(
      CASE 
        WHEN TAG_INV_QTY > prev_qty 
        THEN TAG_INV_QTY - prev_qty 
        ELSE 0 
      END
    ) AS delta_inbound,
    MIN(TAG_INV_QTY) AS first_stock,
    MAX(CASE WHEN BASE_DT = ? THEN TAG_INV_QTY ELSE 0 END) AS current_stock
  FROM daily_stock
  GROUP BY PART_CD
),

-- 4. 판매 계산
sales_calc AS (
  SELECT
    PART_CD,
    SUM(TAG_SALE_QTY) AS total_sales
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE
    (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (${storeCodes})  -- Warehouse 제외
    AND SUBSTR(PART_CD, 1, 3) = (SELECT sesn FROM season_params)
    AND SALE_DT <= ?
  GROUP BY PART_CD
),

-- 5. 판매율 계산
sellthrough_calc AS (
  SELECT
    i.PART_CD,
    i.delta_inbound + i.first_stock AS total_inbound,
    COALESCE(s.total_sales, 0) AS total_sales,
    i.current_stock,
    CASE 
      WHEN (i.delta_inbound + i.first_stock) > 0 
      THEN (COALESCE(s.total_sales, 0) / (i.delta_inbound + i.first_stock)) * 100 
      ELSE 0 
    END AS sellthrough
  FROM inbound_calc i
  LEFT JOIN sales_calc s ON i.PART_CD = s.PART_CD
)

-- 6. 최종 결과
SELECT
  s.PART_CD AS part_cd,
  COALESCE(cm.cat_nm, 'Unknown') AS cat_nm,
  s.total_inbound AS inbound,
  s.total_sales AS sales,
  s.sellthrough,
  s.current_stock AS stock
FROM sellthrough_calc s
LEFT JOIN category_mapping cm ON SUBSTR(s.PART_CD, 4, 3) = cm.cat_cd
WHERE s.total_inbound > 0  -- 입고가 있는 품번만
ORDER BY s.sellthrough DESC
LIMIT 10;  -- TOP 10
```

---

## No Inbound 품번 쿼리

입고는 없는데 판매가 있는 품번 조회:

```sql
SELECT
  s.PART_CD AS part_cd,
  COALESCE(cm.cat_nm, 'Unknown') AS cat_nm,
  0 AS inbound,
  s.total_sales AS sales,
  0 AS sellthrough,
  0 AS stock
FROM sales_calc s
LEFT JOIN inbound_calc i ON s.PART_CD = i.PART_CD
LEFT JOIN category_mapping cm ON SUBSTR(s.PART_CD, 4, 3) = cm.cat_cd
WHERE COALESCE(i.delta_inbound + i.first_stock, 0) = 0  -- 입고 없음
ORDER BY s.total_sales DESC;
```

---

## Redis 캐시 전략

### 캐시 키 형식

#### Sell-through 데이터
```
snapshot:SECTION2:sellthrough:{region}:{brand}:{date}
```

#### Treemap 데이터
```
snapshot:SECTION2:treemap:{region}:{brand}:{date}
```

### 예시
```
snapshot:SECTION2:sellthrough:HKMC:M:2025-02-16
snapshot:SECTION2:treemap:HKMC:M:2025-02-16
```

### TTL
- **Cron 생성 캐시**: 24시간 (86400초)
- **Fallback 캐시**: 24시간 (86400초)

### 캐시 흐름
1. **API 요청** → Redis 캐시 확인
2. **HIT**: 캐시 데이터 반환 (빠름)
3. **MISS**: Snowflake 쿼리 실행 → Redis 저장 → 반환

---

## 카테고리 매핑

### 데이터 파일
```
data/category_mapping.json
```

### 구조
```json
{
  "categories": [
    {
      "cat_cd": "001",
      "cat_nm": "자켓",
      "cat_nm_en": "Jacket"
    },
    {
      "cat_cd": "002",
      "cat_nm": "티셔츠",
      "cat_nm_en": "T-shirt"
    }
  ]
}
```

### 매핑 로직
```typescript
// 품번: 25F00112345
// 시즌: 25F (앞 3자리)
// 카테고리: 001 (4~6번째 자리)
const catCd = partCd.substring(3, 6);
```

---

## 운영 가이드

### 데이터 갱신
- **Cron Job**: 매일 05:00 UTC (한국시간 14:00)
- **수동 갱신**: `/api/cron/section2-snapshot` 호출

### 성능 최적화
- ✅ Redis 캐시 우선 조회
- ✅ Delta 방식 입고 계산 (전체 스냅샷 비교 X)
- ✅ Lazy Load (접혔을 때 조회 안 함)
- ✅ LAG 함수로 전날 재고 효율적 조회

### 문제 해결

#### 판매율이 100% 초과하는 경우
**원인**: 
- 재고 스냅샷 누락
- 타 매장에서 이동된 재고
- 반품 후 재판매

**해결**: 입고 계산 로직 점검

#### No Inbound 품번이 많은 경우
**원인**:
- Main Warehouse 외 입고
- 샘플 품번
- 데이터 오류

**해결**: Warehouse 매핑 확인

---

## 시즌별 분석 팁

### Fall/Winter (F 시즌)
- **기간**: 9월 ~ 2월
- **특징**: 중후한 의류, 아우터 중심
- **목표 판매율**: 70% 이상

### Spring/Summer (S 시즌)
- **기간**: 3월 ~ 8월
- **특징**: 경량 의류, 티셔츠 중심
- **목표 판매율**: 75% 이상 (회전율 높음)

---

## 참고 문서

- [Section 1 매장별 매출 가이드](./SECTION1_STORE_SALES_GUIDE.md)
- [Section 3 운영 가이드](./SECTION3_OPERATIONS_GUIDE.md)
- [날짜/시즌 계산 로직](./lib/date-utils.ts)

---

**버전**: 1.0  
**최종 수정**: 2026-02-17
