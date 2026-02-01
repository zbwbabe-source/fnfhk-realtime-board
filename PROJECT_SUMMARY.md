# HKMC Dashboard MVP - 프로젝트 완료 요약

## ✅ 완료된 작업

### 1. 프로젝트 구조 설정
- ✅ Next.js 14 + TypeScript + Tailwind CSS 설정
- ✅ tsconfig.json, tailwind.config.ts, next.config.js 구성
- ✅ 환경 변수 템플릿 (env.example) 작성

### 2. Data Pipeline
- ✅ Store master CSV → JSON 변환 스크립트
  - `scripts/convert_store_master.js`
  - `data/store_master.json` 생성 완료 (69개 매장)
- ✅ Snowflake 연결 라이브러리 (`lib/snowflake.ts`)
- ✅ Store 유틸리티 함수 (`lib/store-utils.ts`)
- ✅ 날짜/시즌 계산 함수 (`lib/date-utils.ts`)

### 3. Database (Snowflake)
- ✅ DDL 스크립트 작성
  - `DASH_STORE_MTD_SALES` 테이블
  - `DASH_SEASON_SELLTHROUGH` 테이블
- ✅ MERGE 쿼리 작성
  - 섹션1: 매장별 매출 집계
  - 섹션2: 시즌 판매율 집계
- ✅ 초기 설정 스크립트 (`sql/setup_snowflake.sql`)

### 4. Backend API
- ✅ `/api/meta` - 메타 정보 API
- ✅ `/api/section1/store-sales` - 매장별 매출 API
- ✅ `/api/section2/sellthrough` - 판매율 API (Lazy Load)
- ✅ `/api/cron/daily-aggregate` - Vercel Cron Job
  - 매일 05:00 UTC (14:00 KST) 자동 실행
  - CRON_SECRET 헤더 보호

### 5. Frontend UI
- ✅ 대시보드 메인 페이지 (`/dashboard`)
- ✅ Region Toggle (HKMC/TW)
- ✅ Brand Select (MLB/Discovery)
- ✅ Date Select (어제까지 선택 가능)
- ✅ Section1: 매장별 매출 테이블
  - HK/MC 채널별 분류
  - YoY 비교
  - 소계 강조
- ✅ Section2: 당시즌 판매율 (접힘/펼침)
  - TOP 10 / BAD 10
  - No Inbound 리스트
- ✅ Section3: Placeholder

### 6. 배포 설정
- ✅ `vercel.json` - Vercel Cron 설정
- ✅ README.md - 상세 문서
- ✅ QUICKSTART.md - 빠른 시작 가이드

### 7. 빌드 & 검증
- ✅ TypeScript 타입 체크 통과
- ✅ Next.js 빌드 성공
- ✅ 모든 라우트 정상 생성

## 📊 프로젝트 통계

- **총 매장 수**: 69개
  - HKMC (non-WH): 29개
  - HKMC Warehouses: 4개
  - TW: 36개 (MVP 범위 외, placeholder)

- **국가별 분포**:
  - HK: 27개
  - MC: 6개
  - TW: 36개

- **채널별 분포**:
  - 정상: 44개
  - 아울렛: 8개
  - 온라인: 9개
  - Warehouse: 8개

- **브랜드별 분포**:
  - MLB (M): 57개
  - Discovery (X): 12개

## 📁 주요 파일 구조

```
fnfhk_Realtime_Dashboard/
├── app/
│   ├── api/
│   │   ├── cron/daily-aggregate/route.ts
│   │   ├── meta/route.ts
│   │   ├── section1/store-sales/route.ts
│   │   └── section2/sellthrough/route.ts
│   ├── dashboard/
│   │   ├── components/ (5개 컴포넌트)
│   │   └── page.tsx
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── snowflake.ts
│   ├── store-utils.ts
│   ├── date-utils.ts
│   └── types.ts
├── sql/
│   ├── ddl_create_tables.sql
│   ├── merge_section1_store_sales.sql
│   ├── merge_section2_sellthrough.sql
│   └── setup_snowflake.sql
├── data/
│   └── store_master.json
├── scripts/
│   └── convert_store_master.js
├── README.md
├── QUICKSTART.md
├── vercel.json
└── package.json
```

## 🚀 다음 단계

### 즉시 실행 가능
1. `.env.local` 파일 생성 및 Snowflake 정보 입력
2. Snowflake에서 `sql/setup_snowflake.sql` 실행
3. Snowflake에서 `sql/ddl_create_tables.sql` 실행
4. `npm run dev` 로컬 개발 서버 실행

### Vercel 배포
1. GitHub에 Push
2. Vercel에서 프로젝트 Import
3. 환경 변수 설정
4. Deploy
5. Cron Job 자동 활성화 (매일 05:00 UTC)

## ⚠️ 참고사항

### MVP 범위
- **HKMC만 동작**: TW는 UI만 존재 (placeholder)
- **목표값 0**: 추후 업로드 기능 구현 예정
- **Brand 통합**: MLB Kids (I) → MLB (M)으로 자동 합산

### 시즌 코드 계산
- 9~12월: YYF (Fall/Winter)
- 1~2월: (YY-1)F (전년도 Fall/Winter)
- 3~8월: YYS (Spring/Summer)

### Main Warehouse 매핑 (HKMC)
- MLB (M): WHM
- Discovery (X): XHM

## 📝 TODO (추후 구현)
- [ ] 목표값 업로드 및 연동
- [ ] TW 리전 구현
- [ ] Section 3 분석 추가
- [ ] 예측 기능
- [ ] 사용자 인증
- [ ] 캐싱 (Redis/Vercel KV)

---

**버전**: 1.0.0 MVP  
**완료일**: 2026-02-01  
**빌드 상태**: ✅ SUCCESS
