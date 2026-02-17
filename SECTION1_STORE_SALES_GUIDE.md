# Section 1: 매장별 매출 현황 (Store Sales)

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

Section 1은 **매장별 MTD(Month-to-Date) 실적**을 보여주는 섹션입니다.

### 주요 기능
- ✅ 매장별 당월 매출 실적 (MTD ACT)
- ✅ 전년 동기 대비 YoY 비교
- ✅ 전월 대비 MoM 비교
- ✅ 당월 목표 대비 달성률
- ✅ YTD(Year-to-Date) 실적 및 달성률
- ✅ 채널별 분류 (정상/아울렛/온라인)
- ✅ 국가별 분류 (HK/MC/TW)
- ✅ 월말환산 (Month-End Projection)

### 대상 매장
- **포함**: 정상, 아울렛, 온라인 매장
- **제외**: Warehouse (창고)

---

## 데이터 소스

### Primary Table
```sql
SAP_FNF.DW_HMD_SALE_D
```

### 주요 컬럼
| 컬럼명 | 설명 | 비고 |
|--------|------|------|
| `SALE_DT` | 판매 날짜 | Date |
| `LOCAL_SHOP_CD` | 매장 코드 | String |
| `BRD_CD` | 브랜드 코드 | M/I/X |
| `ACT_SALE_AMT` | 실제 판매 금액 | Decimal |
| `TAG_SALE_AMT` | 정가 기준 금액 | Decimal |

### 브랜드 통합 규칙
```sql
CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END
```
- **M**: MLB (정품)
- **I**: MLB Kids → **M으로 통합**
- **X**: Discovery

---

## 계산 로직

### 1. MTD (Month-to-Date) 실적

**기간**: 이번 달 1일 ~ 선택한 날짜

```sql
SUM(
  CASE
    WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
    THEN ACT_SALE_AMT ELSE 0
  END
) AS mtd_act
```

**예시**: 2025-02-16 선택 시
- 기간: 2025-02-01 ~ 2025-02-16
- 매장별 ACT_SALE_AMT 합계

### 2. MTD PY (전년 동월 동기)

**기간**: 전년도 같은 달 1일 ~ 같은 날짜

```sql
SUM(
  CASE
    WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) 
                     AND DATEADD(YEAR, -1, TO_DATE(?))
    THEN ACT_SALE_AMT ELSE 0
  END
) AS mtd_act_py
```

**예시**: 2025-02-16 선택 시
- 기간: 2024-02-01 ~ 2024-02-16

### 3. YoY (Year-over-Year)

전년 동기 대비 성장률

```sql
CASE
  WHEN mtd_act_py > 0
  THEN (mtd_act / mtd_act_py) * 100
  ELSE 0
END AS yoy
```

**해석**:
- 100%: 작년과 동일
- 120%: 작년 대비 20% 증가
- 80%: 작년 대비 20% 감소

### 4. MoM (Month-over-Month)

전월 대비 성장률

```sql
SUM(
  CASE
    WHEN SALE_DT BETWEEN DATEADD(MONTH, -1, DATE_TRUNC('MONTH', TO_DATE(?))) 
                     AND DATEADD(DAY, -1, DATE_TRUNC('MONTH', TO_DATE(?)))
    THEN ACT_SALE_AMT ELSE 0
  END
) AS mtd_act_pm
```

**예시**: 2025-02-16 선택 시
- 전월 기간: 2025-01-01 ~ 2025-01-31 (전월 전체)

### 5. 당월 목표 달성률

```typescript
const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;
```

**데이터 소스**: `data/target.json` (매장별, 월별 목표값)

### 6. YTD (Year-to-Date) 실적

**기간**: 올해 1월 1일 ~ 선택한 날짜

```sql
SUM(
  CASE
    WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
    THEN ACT_SALE_AMT ELSE 0
  END
) AS ytd_act
```

### 7. 할인율

정가 대비 실제 판매가 할인율

```typescript
// MTD 할인율
const discount_rate_mtd = mtd_tag > 0 ? (1 - mtd_act / mtd_tag) * 100 : 0;

// YTD 할인율
const discount_rate_ytd = ytd_tag > 0 ? (1 - ytd_act / ytd_tag) * 100 : 0;
```

### 8. 월말환산 (Month-End Projection)

현재 실적을 월말까지 추정

```typescript
const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
```

**계산 방식**:
1. 현재까지 실적 / 현재까지 가중치
2. 결과 × 월 전체 가중치 (100)

**가중치 데이터**: `HKMCweight_2026_daily.csv`

---

## API 명세

### Endpoint
```
GET /api/section1/store-sales
```

### Query Parameters
| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `region` | ✅ | 리전 | 'HKMC' or 'TW' |
| `brand` | ✅ | 브랜드 | 'M' or 'X' |
| `date` | ✅ | 기준 날짜 | '2025-02-16' |

### Request Example
```bash
GET /api/section1/store-sales?region=HKMC&brand=M&date=2025-02-16
```

### Response Schema

```typescript
{
  asof_date: string;          // 기준 날짜
  region: string;             // HKMC or TW
  brand: string;              // M or X
  
  // HK 정상 매장
  hk_normal: StoreRecord[];
  hk_normal_subtotal: SubtotalRecord;
  
  // HK 아울렛 매장
  hk_outlet: StoreRecord[];
  hk_outlet_subtotal: SubtotalRecord;
  
  // HK 온라인 매장
  hk_online: StoreRecord[];
  hk_online_subtotal: SubtotalRecord;
  
  // HK 전체 소계
  hk_subtotal: SubtotalRecord;
  
  // MC 정상/아울렛/온라인
  mc_normal: StoreRecord[];
  mc_normal_subtotal: SubtotalRecord;
  mc_outlet: StoreRecord[];
  mc_outlet_subtotal: SubtotalRecord;
  mc_online: StoreRecord[];
  mc_online_subtotal: SubtotalRecord;
  mc_subtotal: SubtotalRecord;
  
  // TW (TW 리전 선택 시)
  tw_normal: StoreRecord[];
  tw_normal_subtotal: SubtotalRecord;
  tw_outlet: StoreRecord[];
  tw_outlet_subtotal: SubtotalRecord;
  tw_online: StoreRecord[];
  tw_online_subtotal: SubtotalRecord;
  tw_subtotal: SubtotalRecord;
  
  // 전체 합계
  total_subtotal: SubtotalRecord;
}
```

### StoreRecord Schema

```typescript
{
  shop_cd: string;              // 매장 코드
  shop_name: string;            // 매장명
  country: string;              // HK/MC/TW
  channel: string;              // 정상/아울렛/온라인
  
  // MTD 데이터
  target_mth: number;           // 당월 목표
  mtd_act: number;              // MTD 실적
  progress: number;             // 달성률 (%)
  mtd_act_py: number;           // MTD 전년 실적
  mtd_act_pm: number;           // 전월 실적 (전월 전체)
  yoy: number;                  // YoY (%)
  mom: number;                  // MoM (%)
  monthEndProjection: number;   // 월말환산
  projectedYoY: number;         // 환산 YoY
  discount_rate_mtd: number;    // MTD 할인율 (%)
  
  // YTD 데이터
  ytd_target: number;           // YTD 목표
  ytd_act: number;              // YTD 실적
  progress_ytd: number;         // YTD 달성률 (%)
  ytd_act_py: number;           // YTD 전년 실적
  yoy_ytd: number;              // YTD YoY (%)
  discount_rate_ytd: number;    // YTD 할인율 (%)
  
  forecast: number | null;      // 예측값 (미사용)
}
```

### Response Example (일부)

```json
{
  "asof_date": "2025-02-16",
  "region": "HKMC",
  "brand": "M",
  "hk_normal": [
    {
      "shop_cd": "M01",
      "shop_name": "MLB Causeway Bay",
      "country": "HK",
      "channel": "정상",
      "target_mth": 1500000,
      "mtd_act": 850000,
      "progress": 56.67,
      "mtd_act_py": 900000,
      "yoy": 94.44,
      "mom": 105.2,
      "monthEndProjection": 1600000,
      "ytd_act": 2500000,
      "ytd_target": 3000000,
      "progress_ytd": 83.33
    }
  ],
  "total_subtotal": {
    "shop_cd": "HKMC_TOTAL",
    "shop_name": "HKMC 전체",
    "mtd_act": 11769207,
    "yoy": 46.98,
    "ytd_act": 48502896
  }
}
```

---

## 화면 구성

### 테이블 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│ Section 1: 매장별 매출 현황                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ HK 정상 매장                                                     │
│ ┌──────┬──────┬────────┬────────┬──────┬──────┬──────┐       │
│ │매장  │목표  │당월실적│달성률  │YoY   │MoM   │월말환산│       │
│ ├──────┼──────┼────────┼────────┼──────┼──────┼──────┤       │
│ │M01   │1.5M  │850K    │56.7%   │94.4% │105%  │1.6M  │       │
│ │M02   │...   │...     │...     │...   │...   │...   │       │
│ └──────┴──────┴────────┴────────┴──────┴──────┴──────┘       │
│ HK 정상 합계: 5.2M (YoY: 98.5%)                                │
│                                                                 │
│ HK 아울렛 매장                                                   │
│ ...                                                             │
│                                                                 │
│ MC 정상 매장                                                     │
│ ...                                                             │
│                                                                 │
│ HKMC 전체 합계: 11.8M (YoY: 47.0%)                              │
└─────────────────────────────────────────────────────────────────┘
```

### UI 특징
- 📊 **채널별 그룹화**: 정상/아울렛/온라인으로 구분
- 🎨 **YoY 색상 코딩**: 
  - 초록색: ≥100% (전년 대비 증가)
  - 빨간색: <100% (전년 대비 감소)
- 🔢 **소계 강조**: 채널별, 국가별, 전체 합계 하이라이트
- 📉 **실적 0 매장**: 테이블 맨 아래로 자동 정렬

---

## 주요 지표

### 1. MTD 실적 (mtd_act)
**정의**: 당월 1일부터 기준일까지 실제 판매 금액  
**단위**: 화폐 (HKD 또는 HKD 환산)  
**용도**: 당월 매출 진행 상황 파악

### 2. 달성률 (progress)
**정의**: (MTD 실적 / 당월 목표) × 100  
**단위**: %  
**용도**: 목표 대비 진척도 평가

### 3. YoY (Year-over-Year)
**정의**: (MTD 실적 / 전년 동기 실적) × 100  
**단위**: %  
**기준**: 100% = 전년과 동일  
**용도**: 전년 대비 성장세 파악

### 4. MoM (Month-over-Month)
**정의**: (MTD 실적 / 전월 전체 실적) × 100  
**단위**: %  
**용도**: 전월 대비 추세 분석

### 5. 월말환산 (Month-End Projection)
**정의**: 현재 추세 기준 월말 예상 매출  
**계산**: (MTD 실적 / 현재 가중치) × 100  
**용도**: 월말 실적 예측 및 목표 달성 가능성 평가

### 6. YTD 실적 (ytd_act)
**정의**: 올해 1월 1일부터 기준일까지 누적 매출  
**단위**: 화폐  
**용도**: 연간 목표 대비 진척도 파악

---

## 쿼리 로직

### SQL 쿼리 구조

```sql
WITH store_sales AS (
  SELECT
    LOCAL_SHOP_CD AS shop_cd,
    
    /* MTD ACT */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS mtd_act,
    
    /* MTD ACT PY (전년 동월) */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) 
                         AND DATEADD(YEAR, -1, TO_DATE(?))
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS mtd_act_py,
    
    /* MTD ACT PM (전월) */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATEADD(MONTH, -1, DATE_TRUNC('MONTH', TO_DATE(?))) 
                         AND DATEADD(DAY, -1, DATE_TRUNC('MONTH', TO_DATE(?)))
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS mtd_act_pm,
    
    /* MTD TAG (정가 기준) */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
        THEN TAG_SALE_AMT ELSE 0
      END
    ) AS mtd_tag,
    
    /* YTD ACT */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS ytd_act,
    
    /* YTD ACT PY */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) 
                         AND DATEADD(YEAR, -1, TO_DATE(?))
        THEN ACT_SALE_AMT ELSE 0
      END
    ) AS ytd_act_py,
    
    /* YTD TAG (정가 기준) */
    SUM(
      CASE
        WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
        THEN TAG_SALE_AMT ELSE 0
      END
    ) AS ytd_tag
    
  FROM SAP_FNF.DW_HMD_SALE_D
  WHERE
    (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
    AND LOCAL_SHOP_CD IN (${storeCodes})
    AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND TO_DATE(?)
  GROUP BY LOCAL_SHOP_CD
)
SELECT
  shop_cd,
  mtd_act,
  mtd_act_py,
  mtd_act_pm,
  mtd_tag,
  CASE
    WHEN mtd_act_py > 0
    THEN (mtd_act / mtd_act_py) * 100
    ELSE 0
  END AS yoy,
  CASE
    WHEN mtd_act_pm > 0
    THEN (mtd_act / mtd_act_pm) * 100
    ELSE 0
  END AS mom,
  ytd_act,
  ytd_act_py,
  ytd_tag,
  CASE
    WHEN ytd_act_py > 0
    THEN (ytd_act / ytd_act_py) * 100
    ELSE 0
  END AS yoy_ytd
FROM store_sales
ORDER BY shop_cd
```

### 파라미터 바인딩 (17개)

1-2: MTD ACT current (date, date)  
3-4: MTD ACT PY (date, date)  
5-6: MTD ACT PM (date, date)  
7-8: MTD TAG current (date, date)  
9-10: YTD ACT current (date, date)  
11-12: YTD ACT PY (date, date)  
13-14: YTD TAG current (date, date)  
15: brand filter  
16-17: date range filter (date, date)

---

## TW 리전 환율 처리

TW 리전 선택 시 자동으로 **TWD → HKD** 환율 적용

### 환율 데이터
- **파일**: `data/tw_exchange_rate.json`
- **기간별 환율**: 2512 (2025년 12월) 등

### 환율 적용 로직

```typescript
// TW 리전일 때 환율 적용
const isTwRegion = region === 'TW';
const period = isTwRegion ? getPeriodFromDateString(date) : '';

// 환율 적용 헬퍼 함수
const applyExchangeRate = (amount: number): number => {
  if (!isTwRegion) return amount;
  return convertTwdToHkd(amount, period) || 0;
};

// 사용 예시
const mtd_act = row ? applyExchangeRate(parseFloat(row.MTD_ACT || 0)) : 0;
```

---

## 정렬 및 표시 규칙

### 1. 매장 정렬
```typescript
const sortByClosedStatus = (a: any, b: any) => {
  // MTD 실적이 0인 매장을 맨 아래로
  if (a.mtd_act === 0 && b.mtd_act !== 0) return 1;
  if (a.mtd_act !== 0 && b.mtd_act === 0) return -1;
  // 그 외는 매장 코드 순
  return a.shop_cd.localeCompare(b.shop_cd);
};
```

### 2. 소계 계산
- 각 채널별 소계 (HK 정상, HK 아울렛, HK 온라인 등)
- 국가별 소계 (HK 전체, MC 전체)
- 전체 합계 (HKMC 전체 또는 TW 전체)

### 3. 빈 데이터 처리
- 데이터가 없는 매장도 0으로 표시
- Store master에 있는 모든 매장 표시

---

## Redis 캐시 전략

### 캐시 키 형식
```
snapshot:SECTION1:store-sales:{region}:{brand}:{date}
```

### 예시
```
snapshot:SECTION1:store-sales:HKMC:M:2025-02-16
snapshot:SECTION1:store-sales:TW:M:2025-02-15
```

### TTL (Time-to-Live)
- **Cron 생성 캐시**: 24시간 (86400초)
- **Fallback 캐시**: 24시간 (86400초)

### 캐시 우선순위
1. **Redis 캐시 확인** (cron이 미리 생성)
2. **HIT**: 즉시 반환 (빠름)
3. **MISS**: Snowflake 쿼리 실행 후 캐시 저장

---

## 운영 가이드

### 데이터 갱신 시점
- **Cron Job**: 매일 05:00 UTC (한국시간 14:00)
- **수동 갱신**: `/api/cron/section1-snapshot` 호출

### 성능 최적화
- ✅ Redis 캐시 우선 조회
- ✅ Snowflake 쿼리 최적화 (단일 쿼리로 모든 지표 계산)
- ✅ 필요한 매장만 필터링 (IN 절 사용)

### 문제 해결
- **캐시 확인**: `npx ts-node scripts/check-redis-cache.ts`
- **데이터 검증**: `npx ts-node scripts/check-feb-sales.ts`
- **캐시 초기화**: Redis 키 삭제 또는 TTL 대기

---

## 참고 문서

- [Section 3 운영 가이드](./SECTION3_OPERATIONS_GUIDE.md)
- [Redis 캐시 전략](./docs/cache-strategy.md)
- [환율 처리 가이드](./IMPLEMENTATION_TW_DASHBOARD.md)

---

**버전**: 1.0  
**최종 수정**: 2026-02-17
