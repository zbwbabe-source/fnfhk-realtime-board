# 캐시 전략 가이드

## 📋 개요

FNF HKMC Dashboard는 **Redis 스냅샷 기반 캐싱**으로 통일된 아키텍처를 사용합니다.

### 아키텍처

```
Cron (매일 05:00 KST = UTC 20:00)
  ↓
Snowflake 쿼리 실행 (Region × Brand × Date × Resource)
  ↓
Redis 스냅샷 저장 (gzip + base64, TTL: 72h)
  ↓
API 요청
  ↓
Redis 조회
  ├─ HIT → 즉시 반환 (200-300ms)
  └─ MISS → Snowflake fallback + Redis 저장 (24h TTL) → 반환 (2-5초)
```

---

## 🔑 키 네이밍 규칙

### 표준 키 포맷

```
fnfhk:{SECTION}:{resource}:{REGION}:{BRAND}:{YYYY-MM-DD}
```

### 규칙

- **SECTION**: 대문자 고정 (`SECTION1`, `SECTION2`, `SECTION3`)
- **resource**: 리소스 이름 (kebab-case 권장)
- **REGION**: 대문자 (`HKMC`, `TW`)
- **BRAND**: 대문자 (`M`, `X`)
- **DATE**: ISO 8601 날짜 형식 (`YYYY-MM-DD`)

### 키 생성 함수

```typescript
import { buildSnapshotKey } from '@/lib/snapshotCache';

const key = buildSnapshotKey('SECTION1', 'monthly-trend', 'HKMC', 'M', '2026-02-14');
// => 'fnfhk:SECTION1:monthly-trend:HKMC:M:2026-02-14'
```

---

## 📊 리소스 매핑

### Section 1: 매출 추이

| Resource | 설명 | API 엔드포인트 |
|----------|------|----------------|
| `monthly-trend` | 월별 매출 추이 (12개월) | `/api/section1/monthly-trend` |
| `store-sales` | 매장별 매출 상세 | `/api/section1/store-sales` |

### Section 2: 카테고리 분석

| Resource | 설명 | API 엔드포인트 |
|----------|------|----------------|
| `sellthrough` | 판매율 (Sell-through) | `/api/section2/sellthrough` |
| `treemap` | 카테고리별 트리맵 | `/api/section2/treemap` |

### Section 3: 과시즌 소진

| Resource | 설명 | API 엔드포인트 |
|----------|------|----------------|
| `old-season-inventory` | 과시즌 재고 소진율 | `/api/section3/old-season-inventory` |

---

## ⏱️ TTL 정책

### 스냅샷 TTL (Cron 생성)

- **값:** `72시간` (3일)
- **용도:** Cron Job에서 생성한 스냅샷
- **코드:** `lib/snapshotCache.ts`의 `SNAPSHOT_TTL_SECONDS`

```typescript
export const SNAPSHOT_TTL_SECONDS = 60 * 60 * 72; // 72시간
```

### Fallback TTL (Cache MISS)

- **값:** `24시간` (1일)
- **용도:** API에서 Cache MISS 시 Snowflake 쿼리 후 임시 저장
- **코드:** `lib/snapshotCache.ts`의 `FALLBACK_TTL_SECONDS`

```typescript
export const FALLBACK_TTL_SECONDS = 60 * 60 * 24; // 24시간
```

---

## 📝 로그 규칙

### Cron Job 로그

**시작 로그:**
```javascript
[section1-cron] 🔄 Snapshot generation START {
  dates: ['2026-02-14', '2026-02-13'],
  regions: ['HKMC', 'TW'],
  brands: ['M', 'X'],
  resources: ['monthly-trend', 'store-sales'],
  days_to_generate: 2,
  parallel: false,
  ttl_hours: 72,
  timestamp: '2026-02-15T05:00:00.000Z'
}
```

**완료 로그 (성공):**
```javascript
[section1-cron] ✅ Snapshot generation SUCCESS {
  total_targets: 16,  // 2 dates × 2 regions × 2 brands × 2 resources
  success_count: 16,
  error_count: 0,
  total_kb: '245.32',
  duration_ms: 45231
}
```

**완료 로그 (에러 발생):**
```javascript
[section2-cron] ⚠️  Snapshot generation COMPLETED WITH ERRORS {
  total_targets: 16,
  success_count: 14,
  error_count: 2,
  total_kb: '210.45',
  duration_ms: 48000,
  errors: ['HKMC:M:2026-02-10:sellthrough', 'TW:X:2026-02-09:treemap']
}
```

### API 로그

**Cache HIT:**
```javascript
[section1] 📥 Request START {
  resource: 'monthly-trend',
  region: 'HKMC',
  brand: 'M',
  date: '2026-02-14',
  timestamp: '2026-02-15T14:23:35.971Z'
}

[section1] ✅ Request END - CACHE HIT {
  resource: 'monthly-trend',
  region: 'HKMC',
  brand: 'M',
  date: '2026-02-14',
  cache_hit: true,
  duration_ms: 213,
  generated_at: '2026-02-15T05:00:22.280Z',
  response_rows_count: 12,
  compressed_kb: '8.90'
}
```

**Cache MISS (Snowflake fallback):**
```javascript
[section2] 📥 Request START {
  resource: 'sellthrough',
  region: 'TW',
  brand: 'M',
  date: '2026-02-01',
  timestamp: '2026-02-15T14:30:00.000Z'
}

[section2] ⏳ Cache MISS, executing Snowflake query...

[section2] ✅ Request END - CACHE MISS {
  resource: 'sellthrough',
  region: 'TW',
  brand: 'M',
  date: '2026-02-01',
  cache_hit: false,
  duration_ms: 2834,
  snowflake_ms: 2456
}
```

---

## 🚨 장애 대응

### 1. Cron 실행 실패

**증상:**
- API에서 계속 Cache MISS 발생
- 응답 시간 항상 2초 이상

**원인:**
- Cron이 실행되지 않음
- `CRON_SECRET` 환경변수 누락
- Vercel Cron 설정 오류

**해결:**
1. Vercel Dashboard → Cron Logs 확인
2. 수동 실행: `curl https://your-domain.vercel.app/api/cron/section1-snapshot?secret=xxx`
3. 환경변수 확인: `CRON_SECRET`
4. `vercel.json` Cron 스케줄 확인

### 2. Redis 연결 실패

**증상:**
```
WRONGPASS invalid or missing auth token
```

**원인:**
- `KV_REST_API_TOKEN` 환경변수 누락 또는 잘못됨

**해결:**
1. Vercel KV Dashboard → REST API 탭
2. 토큰 복사 및 `.env.local` 업데이트
3. 서버 재시작

### 3. Snowflake 쿼리 실패

**증상:**
- Cron 로그에서 `error_count > 0`
- API에서 500 에러 반환

**원인:**
- Snowflake 연결 문제
- 쿼리 타임아웃
- 데이터 형식 오류

**해결:**
1. Snowflake 연결 환경변수 확인
2. `lib/section*/` fetch 함수 로그 확인
3. 쿼리 직접 실행하여 데이터 검증

### 4. TTL 만료

**증상:**
- 특정 날짜만 Cache MISS 발생
- 72시간 이전 날짜 요청 시 느림

**원인:**
- TTL 만료 (72시간)

**해결:**
- 정상 동작입니다. Fallback으로 Snowflake 쿼리 실행 후 24시간 TTL로 저장됩니다.
- 필요시 `SECTION_SNAPSHOT_DAYS` 환경변수를 늘려 더 많은 날짜를 Cron으로 생성하세요.

---

## 🌍 환경변수

### 필수 환경변수

```bash
# Vercel KV (Redis)
KV_REST_API_URL=https://your-kv-endpoint.upstash.io
KV_REST_API_TOKEN=your-kv-rest-api-token

# Cron 보안
CRON_SECRET=your-secure-random-string
```

### 선택 환경변수

```bash
# 생성할 과거 날짜 수 (기본: 1, 최대: 30)
SECTION_SNAPSHOT_DAYS=1

# 병렬 실행 여부 (0=직렬, 1=병렬, 기본: 0)
SECTION_CRON_PARALLEL=0
```

**SECTION_SNAPSHOT_DAYS 설명:**
- `1` (기본): 어제 1일치만 생성
- `7`: 최근 7일치 생성
- `30`: 최근 30일치 생성 (최대)

**SECTION_CRON_PARALLEL 설명:**
- `0` (기본): 직렬 실행 (Snowflake warehouse 부담 최소화)
- `1`: 병렬 실행 (속도 우선, Warehouse 부담 증가)

---

## 📈 성능 지표

### 목표 지표

| 지표 | 목표 | 설명 |
|------|------|------|
| Cache Hit Rate | 95% 이상 | Cron 정상 작동 시 |
| 응답 시간 (HIT) | 200-300ms | Redis 조회 + 압축 해제 |
| 응답 시간 (MISS) | 2-5초 | Snowflake 쿼리 + 압축 + Redis 저장 |
| Cron 성공률 | 100% | `success_count / total_targets` |
| Cron 실행 시간 (1일치, 직렬) | ~30초 | 12개 스냅샷 (3 sections × 2 regions × 2 brands) |

### 스냅샷 크기 예상

| Section | Resource | HKMC:M | HKMC:X | TW:M | TW:X |
|---------|----------|--------|--------|------|------|
| Section1 | monthly-trend | ~9KB | ~2KB | ~7KB | ~1KB |
| Section1 | store-sales | ~35KB | ~5KB | ~25KB | ~3KB |
| Section2 | sellthrough | ~40KB | ~8KB | ~30KB | ~6KB |
| Section2 | treemap | ~25KB | ~10KB | ~18KB | ~7KB |
| Section3 | old-season-inventory | ~36KB | ~0.4KB | ~25KB | ~4KB |

**총 1일치 예상 크기:** ~350KB (압축 후)

---

## 🔧 유틸리티 함수

### 스냅샷 저장

```typescript
import { setSnapshot, SNAPSHOT_TTL_SECONDS } from '@/lib/snapshotCache';

await setSnapshot(
  'SECTION1',           // section
  'monthly-trend',      // resource
  'HKMC',               // region
  'M',                  // brand
  '2026-02-14',         // date
  payload,              // data
  SNAPSHOT_TTL_SECONDS  // TTL (optional, default: FALLBACK_TTL_SECONDS)
);
```

### 스냅샷 조회

```typescript
import { getSnapshot } from '@/lib/snapshotCache';

const snapshot = await getSnapshot<any>(
  'SECTION1',
  'monthly-trend',
  'HKMC',
  'M',
  '2026-02-14'
);

if (snapshot) {
  console.log('Cache HIT:', snapshot.payload);
  console.log('Generated at:', snapshot.meta.generated_at);
  console.log('Compressed size:', snapshot.compressedBytes);
} else {
  console.log('Cache MISS');
}
```

---

## 📚 관련 파일

```
lib/
  ├── snapshotCache.ts           # 공통 스냅샷 캐시 유틸
  ├── redis.ts                   # Redis 클라이언트 (Vercel KV)
  ├── cache.ts                   # 캐시 키 빌더
  ├── redisSnapshot.ts           # gzip 압축/해제
  ├── section1/
  │   ├── monthly-trend.ts       # Section1 월별 추이 fetch
  │   └── store-sales.ts         # Section1 매장별 매출 fetch
  ├── section2/
  │   ├── sellthrough.ts         # Section2 판매율 fetch
  │   └── treemap.ts             # Section2 트리맵 fetch
  └── section3Query.ts           # Section3 쿼리 실행

app/api/
  ├── cron/
  │   ├── section1-snapshot/route.ts    # Section1 Cron
  │   ├── section2-snapshot/route.ts    # Section2 Cron
  │   └── section3-snapshot/route.ts    # Section3 Cron
  ├── section1/
  │   ├── monthly-trend/route.ts        # Section1 월별 API
  │   └── store-sales/route.ts          # Section1 매장별 API
  ├── section2/
  │   ├── sellthrough/route.ts          # Section2 판매율 API
  │   └── treemap/route.ts              # Section2 트리맵 API
  └── section3/
      └── old-season-inventory/route.ts # Section3 과시즌 API
```

---

## 📞 문의

문제 발생 시:
1. Vercel Dashboard → Logs 확인
2. Redis 상태 확인 (Upstash Console)
3. Snowflake 쿼리 히스토리 확인

---

**마지막 업데이트:** 2026-02-16  
**작성자:** FNF HKMC Dashboard Team
