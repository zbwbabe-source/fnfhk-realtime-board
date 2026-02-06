# HKMC Real-time Dashboard MVP

> **Next.js + Snowflake + Vercel Cron** 기반 HKMC 매출 및 판매율 실시간 대시보드

---

## 📋 목차

- [개요](#개요)
- [기능](#기능)
- [기술 스택](#기술-스택)
- [프로젝트 구조](#프로젝트-구조)
- [설치 및 실행](#설치-및-실행)
- [Snowflake 설정](#snowflake-설정)
- [환경 변수](#환경-변수)
- [Vercel 배포](#vercel-배포)
- [API 문서](#api-문서)
- [데이터 명세](#데이터-명세)
- [TODO](#todo)

---

## 개요

FNF HKMC(홍콩+마카오) 리전의 매출 및 재고 판매율을 실시간으로 모니터링하는 대시보드입니다.

### MVP 범위
- **Region**: HKMC만 동작 (TW는 UI 존재, placeholder)
- **Brand**: MLB(M), Discovery(X)
  - MLB Kids(I)는 MLB(M)로 통합 집계
- **날짜**: 최대 어제까지 선택 가능 (오늘/미래 선택 불가)
- **데이터 갱신**: 매일 05:00 KST Vercel Cron으로 자동 집계

---

## 기능

### AI 요약
- OpenAI 기반 AI 경영 요약 자동 생성
- 한국어/영어 지원
- **편집 기능**: AI 요약 내용을 수정하고 Upstash Redis에 저장
- 편집된 요약은 30일간 유지되며 우선 표시됨

### 섹션 1: 매장별 매출 (ACT 기준)
- HK/MC 매장별 MTD(Month-to-Date) 실적
- 전년 동기 대비 YoY 비교
- 채널별 분류 (정상/아울렛/온라인)
- Warehouse 채널 제외

### 섹션 2: 당시즌 판매율 (TAG 기준)
- 시즌별 품번 판매율 (Sell-through)
- TOP 10 / BAD 10 품번 분석
- 입고 없는 품번(No Inbound) 리스트
- Warehouse에서 입고, 일반 매장에서 판매 기준

### 섹션 3: (예정)
- 추가 분석 섹션 placeholder

---

## 기술 스택

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Snowflake (SAP_FNF.DW_HMD_SALE_D, DW_HMD_STOCK_SNAP_D)
- **AI**: OpenAI GPT-4
- **Scheduler**: Vercel Cron
- **Deployment**: Vercel
- **Language**: TypeScript

---

## 프로젝트 구조

```
fnfhk_Realtime_Dashboard/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── daily-aggregate/    # Vercel Cron 집계 Job
│   │   ├── meta/                   # 메타 정보 API
│   │   ├── section1/
│   │   │   └── store-sales/        # 매장별 매출 API
│   │   └── section2/
│   │       └── sellthrough/        # 판매율 API
│   ├── dashboard/
│   │   ├── components/             # UI 컴포넌트
│   │   └── page.tsx                # 대시보드 메인
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── snowflake.ts                # Snowflake 연결 유틸
│   ├── store-utils.ts              # Store master 처리
│   └── date-utils.ts               # 날짜/시즌 계산
├── sql/
│   ├── ddl_create_tables.sql       # DDL 스크립트
│   ├── merge_section1_store_sales.sql
│   └── merge_section2_sellthrough.sql
├── data/
│   └── store_master.json           # Store master (변환된 JSON)
├── scripts/
│   └── convert_store_master.js     # CSV → JSON 변환
├── FNF HKMCTW Store code.csv       # Store master 원본
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vercel.json                     # Vercel Cron 설정
└── .env.example                    # 환경 변수 예시
```

---

## 설치 및 실행

### 1. 프로젝트 클론 및 패키지 설치

```bash
# 패키지 설치
npm install

# Store master JSON 변환
npm run convert-store-master
```

### 2. 환경 변수 설정

`.env.local` 파일 생성 (`.env.example` 참고):

```env
# Snowflake Connection
SNOWFLAKE_ACCOUNT=your_account.region
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=SAP_FNF
SNOWFLAKE_SCHEMA=DASH
SNOWFLAKE_WAREHOUSE=your_warehouse
SNOWFLAKE_ROLE=your_role

# OpenAI API Key (for AI insights)
OPENAI_API_KEY=sk-your-openai-api-key

# Upstash Redis (for AI summary editing)
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Vercel Cron Protection
CRON_SECRET=your_random_secret_key_here

NODE_ENV=development
```

### 3. 로컬 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

---

## Snowflake 설정

### 1. DDL 실행

Snowflake에서 `sql/ddl_create_tables.sql` 실행:

```sql
-- DASH 스키마 및 테이블 생성
-- SAP_FNF.DASH.DASH_STORE_MTD_SALES
-- SAP_FNF.DASH.DASH_SEASON_SELLTHROUGH
```

### 2. 권한 설정

사용자에게 다음 권한 부여:

```sql
GRANT USAGE ON DATABASE SAP_FNF TO ROLE your_role;
GRANT USAGE ON SCHEMA SAP_FNF.DASH TO ROLE your_role;
GRANT SELECT ON ALL TABLES IN SCHEMA SAP_FNF TO ROLE your_role;
GRANT ALL ON SCHEMA SAP_FNF.DASH TO ROLE your_role;
GRANT ALL ON ALL TABLES IN SCHEMA SAP_FNF.DASH TO ROLE your_role;
```

### 3. 원천 테이블 확인

다음 테이블이 존재하고 데이터가 있는지 확인:

- `SAP_FNF.DW_HMD_SALE_D` (매출 데이터)
- `SAP_FNF.DW_HMD_STOCK_SNAP_D` (재고 스냅샷)

---

## 환경 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `SNOWFLAKE_ACCOUNT` | Snowflake 계정 | `abc12345.ap-northeast-1` |
| `SNOWFLAKE_USERNAME` | 사용자명 | `fnf_user` |
| `SNOWFLAKE_PASSWORD` | 비밀번호 | `********` |
| `SNOWFLAKE_DATABASE` | 데이터베이스 | `SAP_FNF` |
| `SNOWFLAKE_SCHEMA` | 스키마 | `DASH` |
| `SNOWFLAKE_WAREHOUSE` | Warehouse | `COMPUTE_WH` |
| `SNOWFLAKE_ROLE` | 역할 (선택) | `ANALYST` |
| `OPENAI_API_KEY` | OpenAI API 키 | `sk-...` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis 토큰 | `A...` |
| `CRON_SECRET` | Cron 보안 키 | `random_secret_123` |

---

## Vercel 배포

### 1. GitHub Repository 연결

```bash
git init
git add .
git commit -m "Initial commit: HKMC Dashboard MVP"
git branch -M main
git remote add origin https://github.com/your-username/fnfhk-dashboard.git
git push -u origin main
```

### 2. Vercel 프로젝트 생성

1. https://vercel.com 로그인
2. "Add New Project" 선택
3. GitHub Repository 연결
4. "Import" 클릭

### 3. Vercel 환경 변수 설정

Vercel 프로젝트 설정 → Environment Variables에서 추가:

- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_USERNAME`
- `SNOWFLAKE_PASSWORD`
- `SNOWFLAKE_DATABASE`
- `SNOWFLAKE_SCHEMA`
- `SNOWFLAKE_WAREHOUSE`
- `SNOWFLAKE_ROLE` (선택)
- `OPENAI_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`

### 4. Vercel Cron 설정

`vercel.json` 파일이 자동으로 인식됩니다:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-aggregate",
      "schedule": "0 5 * * *"
    }
  ]
}
```

- **Schedule**: 매일 05:00 UTC (14:00 KST)
- **Endpoint**: `/api/cron/daily-aggregate`
- **Protection**: `Authorization: Bearer {CRON_SECRET}` 헤더 필요

### 5. 수동 Cron 테스트

```bash
curl -X GET \
  https://your-app.vercel.app/api/cron/daily-aggregate \
  -H "Authorization: Bearer your_cron_secret"
```

---

## API 문서

### GET `/api/meta`

대시보드 메타 정보

**Response:**
```json
{
  "available_dates": ["2026-01-31", "2026-01-30", ...],
  "brands": ["M", "X"],
  "regions": ["HKMC", "TW"],
  "brand_labels": {
    "M": "MLB",
    "X": "Discovery"
  },
  "region_labels": {
    "HKMC": "HKMC",
    "TW": "TW (Coming Soon)"
  }
}
```

### GET `/api/section1/store-sales`

매장별 매출 데이터

**Query Parameters:**
- `region`: 'HKMC' or 'TW'
- `brand`: 'M' or 'X'
- `date`: 'YYYY-MM-DD'

**Response:**
```json
{
  "asof_date": "2026-01-31",
  "region": "HKMC",
  "brand": "M",
  "hk_normal": [...],
  "hk_outlet": [...],
  "hk_online": [...],
  "mc_subtotal": {...},
  "total_subtotal": {...}
}
```

### GET `/api/section2/sellthrough`

판매율 데이터 (Lazy Load)

**Query Parameters:**
- `region`: 'HKMC' or 'TW'
- `brand`: 'M' or 'X'
- `date`: 'YYYY-MM-DD'

**Response:**
```json
{
  "asof_date": "2026-01-31",
  "region": "HKMC",
  "brand": "M",
  "header": {
    "sesn": "25F",
    "overall_sellthrough": 67.85
  },
  "top10": [...],
  "bad10": [...],
  "no_inbound": [...]
}
```

---

## 데이터 명세

### Brand Normalization

| BRD_CD | 화면 표시 | 설명 |
|--------|----------|------|
| M | MLB | MLB 정품 |
| I | MLB | MLB Kids → M으로 합산 |
| X | Discovery | Discovery |

### 시즌 코드 계산

| 기간 | 시즌 코드 | 예시 |
|------|----------|------|
| 9~12월 | YYF | 2025년 9월 → 25F |
| 1~2월 | (YY-1)F | 2026년 1월 → 25F |
| 3~8월 | YYS | 2026년 3월 → 26S |

### Main Warehouse 매핑 (HKMC)

| Brand | Warehouse Code |
|-------|----------------|
| M (MLB) | WHM |
| X (Discovery) | XHM |

### Store Master

- **파일**: `FNF HKMCTW Store code.csv`
- **변환**: `npm run convert-store-master`
- **출력**: `data/store_master.json`

**컬럼:**
- `store_cd`: 매장 코드
- `brand`: M / X
- `country`: HK / MC / TW
- `channel`: 정상 / 아울렛 / 온라인 / Warehouse

---

## TODO

### 추후 구현 예정

- [ ] **목표값 연동**: 월 목표값 업로드 기능 (현재 0으로 고정)
- [ ] **TW 리전**: 대만 데이터 집계 및 표시
- [ ] **섹션 3**: 추가 분석 섹션 구현
- [ ] **예측 기능**: MTD 기반 월말 예측값 계산
- [ ] **사용자 인증**: 접근 권한 관리
- [ ] **알림 기능**: 성과 이상치 알림
- [ ] **모바일 최적화**: 반응형 레이아웃 개선

### 개선 사항

- [ ] **캐싱**: API 응답 캐싱 (Redis/Vercel KV)
- [ ] **에러 핸들링**: 상세 에러 메시지 및 로깅
- [ ] **테스트**: Unit/Integration 테스트 추가
- [ ] **문서화**: API 문서 자동화 (Swagger/OpenAPI)
- [ ] **성능 최적화**: SQL 쿼리 튜닝

---

## 주요 명세

### 집계 로직

#### 섹션1: 매장별 MTD 매출
- **데이터 소스**: `DW_HMD_SALE_D`
- **기준**: `ACT_SALE_AMT`
- **범위**: 이번 달 1일 ~ asof_date
- **제외**: Warehouse 채널

#### 섹션2: 당시즌 판매율
- **Inbound (입고)**: 
  - Warehouse only (WHM, XHM)
  - TAG 기준
  - Delta 방식 (증가분 + 첫 재고)
- **Sales (판매)**:
  - 일반 매장 (Warehouse 제외)
  - TAG 기준
- **Sell-through**: Sales / Inbound × 100

---

## 라이선스

Internal Use Only - FNF Corporation

---

## 문의

프로젝트 관련 문의는 개발팀으로 연락 바랍니다.

---

**버전**: 1.0.0 MVP  
**최종 수정**: 2026-02-01
