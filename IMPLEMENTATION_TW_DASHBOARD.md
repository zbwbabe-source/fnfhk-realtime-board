# TW 리전 대시보드 구현 완료

## 구현 일시
2026-02-12

## 구현 내용

### 1. 환율 데이터 준비 ✅
- **파일**: `data/tw_exchange_rate.json`
- **내용**: 2025년 1월 ~ 2026년 12월 (24개월) TWD → HKD 환율 데이터
- **형식**: `{ "2501": 0.2364, "2502": 0.2364, ... }`
- **스크립트**: `scripts/convert-exchange-rate.ts` (CSV → JSON 변환)

### 2. 환율 유틸리티 함수 ✅
- **파일**: `lib/exchange-rate-utils.ts`
- **주요 함수**:
  - `getPeriodFromDateString(dateStr)`: 날짜 문자열에서 YYMM 형식 추출
  - `getExchangeRate(period)`: 기간별 환율 조회 (없으면 최근 환율 반환)
  - `convertTwdToHkd(amount, period)`: TWD 금액을 HKD로 변환

### 3. RegionToggle UI 활성화 ✅
- **파일**: `app/dashboard/components/RegionToggle.tsx`
- **변경사항**:
  - TW 버튼 `disabled` 속성 제거
  - 버튼 텍스트: "TW (예정)" → "TW"
  - TW 선택 가능

### 4. Section1 API 환율 적용 ✅
- **파일**: `app/api/section1/store-sales/route.ts`
- **적용 필드**:
  - MTD: `mtd_act`, `mtd_act_py`, `mtd_act_pm`, `mtd_tag`
  - YTD: `ytd_act`, `ytd_act_py`, `ytd_tag`
  - 목표: `target_mth`, `ytd_target`
- **로직**: TW 리전일 때 모든 금액 필드에 환율 곱하기 (TWD × Rate = HKD)

### 5. Section2 API 환율 적용 ✅
- **파일**: `app/api/section2/sellthrough/route.ts`
- **적용 필드**:
  - Header: `totalSales`, `totalStock`, `totalInbound`, `totalSalesLY`, `totalInboundLY`
  - Products: `inbound_tag`, `sales_tag`
- **로직**: TW 리전일 때 모든 금액 필드에 환율 적용, 판매율은 그대로 유지

### 6. Section3 API 환율 적용 ✅
- **파일**: `app/api/section3/old-season-inventory/route.ts`
- **적용 필드**:
  - Header: `base_stock_amt`, `curr_stock_amt`, `stagnant_stock_amt`, `depleted_stock_amt`
  - Years: 동일한 필드들
  - Categories: 동일한 필드들
  - SKUs: 동일한 필드들 + `period_tag_sales`, `period_act_sales`
- **로직**: TW 리전일 때 모든 금액 필드에 환율 적용

### 7. UI 컴포넌트 통화 표시 업데이트 ✅
- **번역 파일**: `lib/translations.ts`
  - 추가된 키: `unitWithExchange`
  - 한국어: "단위: HKD (환율적용)"
  - 영어: "Unit: HKD (Exch. Applied)"

- **Section1Card** (`app/dashboard/components/Section1Card.tsx`):
  - `region` prop 추가
  - TW 리전일 때 "단위: HKD (환율적용)" 표시

- **Section2Card** (`app/dashboard/components/Section2Card.tsx`):
  - `region` prop 추가
  - TW 리전일 때 "단위: HKD (환율적용)" 표시

- **Section3Card** (`app/dashboard/components/Section3Card.tsx`):
  - `region` prop 추가
  - TW 리전일 때 "단위: HKD (환율적용)" 표시

- **Dashboard Page** (`app/dashboard/page.tsx`):
  - 모든 섹션 카드에 `region` prop 전달

## 환율 적용 로직

```typescript
// 기본 흐름
1. date에서 YYMM 추출 (예: "2026-02-11" → "2602")
2. tw_exchange_rate.json에서 환율 조회 (예: 0.2475)
3. SQL 결과의 TWD 금액에 환율 곱하기
4. HKD로 변환된 금액 반환

// 예시
TWD 1,000,000 × 0.2475 (환율) = HKD 247,500
```

## 주요 특징

### 1. 통화 변환
- **원본 데이터**: TWD (대만 달러)
- **표시 통화**: HKD (홍콩 달러)
- **환율**: `TW_Exchange Rate.csv` 파일 기준 (YYMM별)

### 2. 필터링
- **Region**: TW 선택 시
- **Country**: TW 매장만 자동 필터링
- **Brand**: M (MLB), X (Discovery) 동일
- **Warehouse**: WTM (MLB), DTM (Discovery)

### 3. 판매율 계산
- **금액**: 환율 적용 (TWD → HKD)
- **수량**: 환율 적용 안 함 (그대로)
- **판매율**: 금액 기준 계산 (환율 적용 후 비율)

### 4. YoY 비교
- **전년도 데이터**: 동일하게 환율 적용
- **비교 정확성**: TWD 데이터를 모두 HKD로 변환 후 비교

## 파일 변경 목록

### 새로 생성된 파일
1. `data/tw_exchange_rate.json` - 환율 데이터
2. `lib/exchange-rate-utils.ts` - 환율 유틸리티
3. `scripts/convert-exchange-rate.ts` - CSV → JSON 변환 스크립트
4. `IMPLEMENTATION_TW_DASHBOARD.md` - 구현 문서 (이 파일)

### 수정된 파일
1. `app/dashboard/components/RegionToggle.tsx` - TW 버튼 활성화
2. `app/api/section1/store-sales/route.ts` - 환율 적용
3. `app/api/section2/sellthrough/route.ts` - 환율 적용
4. `app/api/section3/old-season-inventory/route.ts` - 환율 적용
5. `lib/translations.ts` - 통화 표시 추가
6. `app/dashboard/components/Section1Card.tsx` - 통화 표시
7. `app/dashboard/components/Section2Card.tsx` - 통화 표시
8. `app/dashboard/components/Section3Card.tsx` - 통화 표시
9. `app/dashboard/page.tsx` - region prop 전달

## 환율 누락 처리

1. **해당 기간 환율 없음**: 가장 최근 환율 사용
2. **환율 데이터 전체 없음**: 기본값 0.25 사용 (에러 로그 출력)

## 테스트 체크리스트

- [x] CSV → JSON 변환 스크립트 정상 동작
- [x] 환율 유틸리티 함수 정상 동작
- [x] RegionToggle에서 TW 버튼 활성화 및 선택 가능
- [x] Section1 API에 환율 적용 로직 추가
- [x] Section2 API에 환율 적용 로직 추가
- [x] Section3 API에 환율 적용 로직 추가
- [x] 모든 카드 컴포넌트에 통화 표시 업데이트
- [x] 린트 오류 없음
- [ ] TW 리전 선택 시 TW 매장만 조회 (실제 데이터 테스트 필요)
- [ ] 모든 금액이 환율 적용되어 HKD로 표시 (실제 데이터 테스트 필요)
- [ ] 판매율 계산 정확성 확인 (실제 데이터 테스트 필요)
- [ ] YoY 비교 정상 작동 (실제 데이터 테스트 필요)
- [ ] HKMC 리전 기능 정상 작동 (기존 로직 유지 확인 필요)

## 실제 데이터 테스트 필요 항목

1. **TW 매장 데이터 존재 여부 확인**
   - Snowflake DB에 TW 매장 코드로 데이터가 있는지 확인
   - TW 매장 코드: `store_master.json`에 정의된 TW 매장들

2. **환율 적용 결과 확인**
   - TW 리전 선택 시 모든 금액이 HKD로 표시되는지 확인
   - 예상 금액 범위: TWD 금액의 약 1/4 (환율 0.25 기준)

3. **기존 HKMC 리전 영향 없음 확인**
   - HKMC 선택 시 기존과 동일하게 작동하는지 확인
   - 환율 적용 안 됨 (region !== 'TW')

## 다음 단계 (선택사항)

1. **Cron Job 업데이트** (필요 시)
   - `app/api/cron/daily-aggregate/route.ts`
   - TW 리전도 자동 집계에 포함
   - 환율 적용하여 HKD로 저장

2. **환율 데이터 자동 업데이트** (필요 시)
   - 주기적으로 환율 데이터 업데이트
   - API 또는 자동 스크립트로 처리

## 참고사항

- 모든 금액은 HKD 기준으로 표시됩니다 (TW 리전 선택 시)
- 원본 데이터는 TWD이며, 환율을 곱하여 HKD로 변환합니다
- 환율은 `TW_Exchange Rate.csv` 파일에 정의되어 있습니다
- 기존 HKMC 리전의 동작에는 영향을 주지 않습니다
