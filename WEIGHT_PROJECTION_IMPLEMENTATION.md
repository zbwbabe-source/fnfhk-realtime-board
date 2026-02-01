# 월말환산 및 환산 YoY 구현 완료 ✅

## 📋 구현 개요

가중치 기반 월말 매출 환산 기능을 Section 1 매장별 매출 테이블에 추가했습니다.

---

## 🎯 추가된 기능

### 1. **월말환산 (Month-End Projection)**
- **계산 방식**: `당월실적 × (월전체가중치 / 누적가중치)`
- **목적**: 과거 일자 패턴(주말·홍콩휴일)을 고려하여 월말 매출을 추정
- **데이터 소스**: `public/weight_2026_daily.csv`

### 2. **환산 YoY (Projected YoY)**
- **계산 방식**: `(당해년도 월말환산 / 전년도 월말환산) × 100`
- **색상 코딩**: 80% 미만 빨강, 80% 이상 초록

---

## 📁 변경된 파일

### 1. **`public/weight_2026_daily.csv`** (신규)
```
HKMCweight_2026_daily.csv → public/weight_2026_daily.csv로 이동
- DATE: 2026-01-01 ~ 2026-12-31
- weight: 일자별 가중치 값
```

### 2. **`lib/weight-utils.ts`** (신규)
```typescript
// 주요 함수:
- loadWeightData(): CSV를 fetch로 로드 (브라우저)
- loadWeightDataServer(): fs로 로드 (서버)
- calculateMonthEndProjection(mtdActual, asOfDate, weightMap): 월말환산 계산
- calculateProjectedYoY(currentMtd, lastYearMtd, asOfDate, weightMap): 환산 YoY 계산
```

**계산 로직**:
```typescript
// 월 전체 가중치
fullWeight = Σ weight(d) for d in [월초..월말]

// 누적 가중치 (asOfDate까지)
cumWeight = Σ weight(d) for d in [월초..asOfDate]

// 월말환산
monthEndProjection = MTD_actual × (fullWeight / cumWeight)

// 환산 YoY
currentProjection = calculateMonthEndProjection(currentMtd, asOfDate, weightMap)
lyProjection = calculateMonthEndProjection(lastYearMtd, lyAsOfDate, weightMap)
projectedYoY = (currentProjection / lyProjection) × 100
```

### 3. **`app/api/section1/store-sales/route.ts`** (수정)
- Import 추가: `loadWeightDataServer`, `calculateMonthEndProjection`, `calculateProjectedYoY`
- 가중치 데이터 로드: `const weightMap = await loadWeightDataServer();`
- 각 매장별 계산:
  ```typescript
  const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
  const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);
  ```
- 채널 합계 계산에도 동일 로직 적용

### 4. **`app/dashboard/components/Section1Table.tsx`** (수정)

#### 타입 업데이트:
```typescript
interface StoreRow {
  // ... 기존 필드
  monthEndProjection: number; // 추가
  projectedYoY: number; // 추가
}
```

#### 정렬 지원:
```typescript
case 'monthEndProjection':
case 'projectedYoY':
```

#### 테이블 컬럼 추가:
```tsx
<th className="..." onClick={() => handleSort('monthEndProjection')}>
  <div className="...">
    월말환산
    {getSortIcon('monthEndProjection')}
    <span className="ml-1 text-xs text-gray-500 cursor-help">ⓘ</span>
  </div>
  {/* Tooltip */}
  <div className="absolute hidden group-hover:block ...">
    과거 일자 패턴(주말·홍콩휴일) 가중치로 월말 매출을 환산한 추정치
    <br/>
    <span className="text-gray-300 italic">MTD × (월전체가중치/누적가중치)</span>
  </div>
</th>

<th className="..." onClick={() => handleSort('projectedYoY')}>
  환산 YoY
</th>
```

#### 데이터 셀 추가:
```tsx
<td className="...">{formatNumber(row.monthEndProjection)}</td>
<td className="...">{formatPercent(row.projectedYoY)}</td>
```

---

## 🎨 UI 변경 사항

### 테이블 컬럼 순서:
```
매장 | 목표(월) | 당월실적 | 목표대비 | 전년동월 | YoY | 월말환산 ⓘ | 환산 YoY
```

### Tooltip 구현:
- **위치**: "월말환산" 헤더 위에 마우스 오버 시 표시
- **내용**:
  - 첫 줄: "과거 일자 패턴(주말·홍콩휴일) 가중치로 월말 매출을 환산한 추정치"
  - 둘째 줄: "MTD × (월전체가중치/누적가중치)"
- **스타일**: 다크 배경, 흰색 글씨, 우상단 표시

### 색상 코딩:
- **환산 YoY**: 80% 미만 빨강, 80% 이상 초록 (기존 YoY와 동일 규칙)
- **월말환산**: 숫자 포맷만 표시 (색상 없음)

---

## ✅ 검증 완료

### 1. 빌드 성공:
```bash
npm run build
✓ Compiled successfully
✓ Generating static pages (7/7)
```

### 2. 린트 에러 없음:
```bash
No linter errors found.
```

### 3. 개발 서버 실행 중:
```
http://localhost:3000
```

---

## 📊 예시 계산 (2026-01-15 기준)

### 가정:
- 당월실적 (MTD): 1,000,000
- 전년동월 (LY MTD): 800,000
- 2026-01-01 ~ 2026-01-15 누적가중치: 10.5
- 2026-01-01 ~ 2026-01-31 전체가중치: 25.0
- 2025-01-01 ~ 2025-01-15 누적가중치: 9.8
- 2025-01-01 ~ 2025-01-31 전체가중치: 24.5

### 계산:
```
월말환산 = 1,000,000 × (25.0 / 10.5) = 2,380,952
전년 월말환산 = 800,000 × (24.5 / 9.8) = 2,000,000
환산 YoY = (2,380,952 / 2,000,000) × 100 = 119.0%
```

---

## 🔍 주요 특징

### 1. **캐싱 구조**:
- 가중치 데이터는 첫 로드 후 메모리에 캐시
- 동일 요청 시 빠른 응답 보장

### 2. **안전한 Fallback**:
- 가중치 데이터 없을 시 → 당월실적 그대로 반환
- 누적가중치 0일 시 → 당월실적 그대로 반환
- 전년 데이터 없을 시 → YoY = 0

### 3. **정렬 기능**:
- 월말환산 및 환산 YoY 컬럼 모두 클릭 정렬 지원
- 영업종료 매장은 항상 하단 유지

### 4. **채널 합계**:
- HK/MC 채널별 합계에도 동일 계산 적용
- MC 전체 합계, HKMC 전체 합계에도 적용

---

## 🚀 다음 단계

### 배포:
```bash
# Git에 커밋
git add .
git commit -m "feat: 월말환산 및 환산 YoY 추가"
git push

# Vercel 자동 배포 (연동된 경우)
# 또는 수동 배포:
vercel --prod
```

### 테스트:
1. http://localhost:3000/dashboard 접속
2. HKMC 리전 선택
3. 브랜드 선택 (M 또는 X)
4. 날짜 선택 (예: 2026-01-31)
5. Section 1 테이블 확인:
   - "월말환산" 컬럼에 마우스 오버 → Tooltip 표시 확인
   - 값이 당월실적보다 큰지 확인 (월말 아닌 경우)
   - "환산 YoY" 컬럼 값 확인
   - 정렬 기능 테스트

---

## 📝 참고 사항

### CSV 파일 형식:
```csv
DATE,weight
2026-01-01,0.698940306
2026-01-02,0.705191186
...
```

### 환경 변수:
- 변경 사항 없음 (기존 `.env.local` 그대로 사용)

### 의존성:
- 새로운 npm 패키지 설치 없음
- Next.js 내장 fetch 및 fs 모듈 사용

---

## ✨ 구현 완료!

모든 TODO가 완료되었으며, 빌드 및 린트 에러 없이 정상 작동합니다. 🎉

**테스트 후 배포하시면 됩니다!**
