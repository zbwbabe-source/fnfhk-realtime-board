# Section3 운영 가이드

## 📋 개요

Section3 (과시즌 소진) 데이터는 Redis 스냅샷 기반 캐싱으로 운영됩니다.

### 아키텍처

```
Cron (매일 05:00 KST)
  ↓
Snowflake 쿼리 실행 (Region × Brand × Date)
  ↓
Redis 스냅샷 저장 (gzip + base64, TTL: 72h/14일 - 코드 하드코딩)
  ↓
API 요청
  ↓
Redis 조회 (HIT → 즉시 반환, MISS → Snowflake fallback + Redis 저장 [24h TTL - 코드 하드코딩])
```

---

## 🔧 구성 요소

### 1. Redis 클라이언트
**파일:** `lib/redis.ts`

```typescript
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
```

- **Vercel KV** 사용 (Upstash Redis 기반)
- 환경변수: `KV_REST_API_URL`, `KV_REST_API_TOKEN`

### 2. Cron Job
**파일:** `app/api/cron/section3-snapshot/route.ts`
**URL:** `/api/cron/section3-snapshot?secret=xxx`
**스케줄:** 매일 05:00 KST (Vercel Cron)

**역할:**
- 매일 어제 날짜 기준 Section3 데이터 스냅샷 생성
- Region: HKMC, TW
- Brand: M, X
- 총 4개 조합 (기본) 또는 N일 × 4개 조합
- **TTL (코드 하드코딩):**
  - 72시간 (1일치, `60 * 60 * 72`)
  - 14일 (N일치, `60 * 60 * 24 * 14`)
  - 위치: `app/api/cron/section3-snapshot/route.ts` 61번 줄

### 3. API 엔드포인트
**파일:** `app/api/section3/old-season-inventory/route.ts`
**URL:** `/api/section3/old-season-inventory?region=HKMC&brand=M&date=2026-02-14`

**동작:**
1. Redis 스냅샷 조회
2. HIT → 즉시 반환 (200-300ms)
3. MISS → Snowflake 쿼리 실행 → Redis 저장 (**24시간 TTL**, 코드 하드코딩) → 반환 (2-5초)
   - Fallback TTL 위치: `route.ts` 114번 줄 (`60 * 60 * 24`)

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

### Section3 Cron 설정 (선택)

```bash
# 생성할 과거 날짜 수 (기본: 1, 최대: 30)
SECTION3_SNAPSHOT_DAYS=1

# 병렬 실행 여부 (0=직렬, 1=병렬, 기본: 0)
SECTION3_CRON_PARALLEL=0
```

**SECTION3_SNAPSHOT_DAYS 설명:**
- `1` (기본): 어제 1일치만 생성 (4개 스냅샷)
- `7`: 최근 7일치 생성 (28개 스냅샷)
- **TTL (자동 결정):**
  - 1일치 → **72시간** (코드 하드코딩: `60 * 60 * 72`)
  - 여러 날짜 → **14일** (코드 하드코딩: `60 * 60 * 24 * 14`)

**SECTION3_CRON_PARALLEL 설명:**
- `0` (기본): 직렬 실행 (Snowflake warehouse 부담 최소화)
- `1`: 병렬 실행 (속도 우선, 28개 스냅샷 약 2분 소요)

**Fallback TTL (Cache MISS 시):**
- API에서 Cache MISS 발생 시 Snowflake 쿼리 후 Redis 저장
- **TTL: 24시간** (코드 하드코딩: `60 * 60 * 24`)
- 위치: `app/api/section3/old-season-inventory/route.ts` 114번 줄

---

## 📊 로깅 (운영 관측성)

### Cron Job 로그

**시작 로그:**
```javascript
[section3-cron] 🔄 Snapshot generation START {
  dates: [ '2026-02-14', '2026-02-13', ... ],
  regions: [ 'HKMC', 'TW' ],
  brands: [ 'M', 'X' ],
  days_to_generate: 7,
  parallel: true,
  ttl_hours: 336,
  timestamp: '2026-02-15T05:00:00.000Z'
}
```

**완료 로그 (성공):**
```javascript
[section3-cron] ✅ Snapshot generation SUCCESS {
  total_targets: 28,
  success_count: 28,
  error_count: 0,
  total_kb: '456.86',
  duration_ms: 117273
}
```

**완료 로그 (에러 발생):**
```javascript
[section3-cron] ⚠️  Snapshot generation COMPLETED WITH ERRORS {
  total_targets: 28,
  success_count: 26,
  error_count: 2,
  total_kb: '423.45',
  duration_ms: 120000,
  errors: [ 'HKMC:M:2026-02-10', 'TW:X:2026-02-09' ]
}
```

### API 로그

**Cache HIT:**
```javascript
[section3] 📥 Request START {
  region: 'HKMC',
  brand: 'M',
  date: '2026-02-14',
  timestamp: '2026-02-15T14:23:35.971Z'
}

[section3] ✅ Request END - CACHE HIT {
  region: 'HKMC',
  brand: 'M',
  date: '2026-02-14',
  cache_hit: true,
  key: 'fnfhk:SECTION3:OLD-SEASON-INVENTORY:HKMC:M:2026-02-14',
  duration_ms: 213,
  generated_at: '2026-02-15T05:00:22.280Z',
  response_rows_count: 993,
  compressed_kb: '35.90'
}
```

**Cache MISS (Snowflake fallback):**
```javascript
[section3] 📥 Request START {
  region: 'HKMC',
  brand: 'M',
  date: '2026-02-01',
  timestamp: '2026-02-15T14:30:00.000Z'
}

[section3] ⏳ Cache MISS, executing Snowflake query... { key: 'fnfhk:...:2026-02-01' }

[section3] 💾 Redis SET success {
  key: 'fnfhk:SECTION3:OLD-SEASON-INVENTORY:HKMC:M:2026-02-01',
  compressed_kb: '35.85',
  ttl_seconds: 21600
}

[section3] ✅ Request END - CACHE MISS {
  region: 'HKMC',
  brand: 'M',
  date: '2026-02-01',
  cache_hit: false,
  key: 'fnfhk:SECTION3:OLD-SEASON-INVENTORY:HKMC:M:2026-02-01',
  duration_ms: 2834,
  snowflake_ms: 2456,
  response_rows_count: 993
}
```

---

## 🚀 운영 시나리오

### 시나리오 1: 기본 운영 (1일치)

```bash
# .env.local
SECTION3_SNAPSHOT_DAYS=1
SECTION3_CRON_PARALLEL=0
```

- 매일 05:00 KST, 어제 날짜 4개 스냅샷 생성
- 직렬 실행 (~8-10초)
- TTL: 72시간

### 시나리오 2: 주간 히스토리 (7일치)

```bash
# .env.local
SECTION3_SNAPSHOT_DAYS=7
SECTION3_CRON_PARALLEL=0
```

- 매일 05:00 KST, 최근 7일 × 4개 = 28개 스냅샷 생성
- 직렬 실행 (~50-60초)
- TTL: 14일

### 시나리오 3: 빠른 생성 (병렬)

```bash
# .env.local
SECTION3_SNAPSHOT_DAYS=7
SECTION3_CRON_PARALLEL=1
```

- 병렬 실행 (~2분, Snowflake 연결 28개 동시)
- **주의:** Warehouse 부담 증가
- 권장: 충분한 Warehouse 크기 필요

---

## 🔍 모니터링

### 주요 지표

1. **Cron Job 성공률**
   - `success_count / total_targets`
   - 목표: 100%

2. **Cache Hit Rate**
   - Redis HIT 비율
   - 목표: 95% 이상 (Cron 정상 작동 시)

3. **응답 시간**
   - Cache HIT: 200-300ms
   - Cache MISS: 2-5초

4. **스냅샷 크기**
   - HKMC:M: ~36KB
   - HKMC:X: ~0.4KB
   - TW:M: ~25KB
   - TW:X: ~4KB
   - 총 1일치: ~65KB

### 알람 조건

1. **Cron 실패**
   - `error_count > 0`
   - 로그에서 `[section3-cron] ⚠️` 검색

2. **높은 Cache MISS**
   - HIT rate < 90%
   - Cron 작동 여부 확인 필요

3. **느린 응답**
   - Cache HIT인데 500ms 초과
   - Redis 성능 이슈 가능성

---

## 🛠️ 트러블슈팅

### 문제 1: Redis 연결 실패

**증상:**
```
WRONGPASS invalid or missing auth token
```

**원인:**
- `KV_REST_API_TOKEN` 환경변수 누락 또는 잘못됨

**해결:**
1. Vercel KV Dashboard → REST API 탭
2. 복사 버튼으로 전체 토큰 복사
3. `.env.local` 업데이트
4. 서버 재시작

### 문제 2: Cron 실행 안됨

**증상:**
- API에서 계속 Cache MISS 발생
- 응답 시간 항상 2초 이상

**원인:**
- Cron이 실행되지 않음
- 또는 TTL 만료 (72시간/14일)

**해결:**
1. Vercel Dashboard → Cron Logs 확인
2. 수동 실행: `curl https://your-domain.vercel.app/api/cron/section3-snapshot?secret=xxx`
3. 환경변수 `CRON_SECRET` 확인
4. TTL 확인: 1일치는 72시간, N일치는 14일 (코드 하드코딩)

### 문제 3: 병렬 실행 시 Snowflake 에러

**증상:**
```
error_count > 0
Too many connections
```

**원인:**
- Warehouse 동시 연결 제한 초과

**해결:**
1. `SECTION3_CRON_PARALLEL=0` (직렬로 변경)
2. 또는 Warehouse 크기 증가
3. 또는 `SECTION3_SNAPSHOT_DAYS` 감소

---

## 📈 성능 벤치마크

### 테스트 결과 (2026-02-15)

| 설정 | 스냅샷 수 | 실행 시간 | 총 크기 |
|------|-----------|-----------|---------|
| 1일치 직렬 | 4개 | 8.6초 | 65KB |
| 7일치 직렬 | 28개 | ~60초 | 457KB |
| 7일치 병렬 | 28개 | 117초* | 457KB |

*병렬 실행 시간이 더 긴 이유: Snowflake 연결 초기화 오버헤드

### API 응답 시간

- **Cache HIT:** 200-300ms (압축 해제 포함)
- **Cache MISS:** 2,000-5,000ms (Snowflake 쿼리 + 압축 + Redis 저장)

---

## 🎯 권장 설정

### 프로덕션 (운영 환경)

```bash
# 기본: 1일치, 직렬
SECTION3_SNAPSHOT_DAYS=1
SECTION3_CRON_PARALLEL=0
```

- 안정성 우선
- Warehouse 부담 최소화
- 충분한 TTL (72시간 - 코드 하드코딩)
- Fallback TTL: 24시간 (코드 하드코딩)

### 스테이징 (테스트 환경)

```bash
# 7일치, 병렬 (빠른 테스트)
SECTION3_SNAPSHOT_DAYS=7
SECTION3_CRON_PARALLEL=1
```

- 빠른 데이터 준비
- 다양한 날짜 테스트 가능
- TTL: 14일 (코드 하드코딩)

---

## 📝 체크리스트

### 배포 전
- [ ] Vercel KV 생성 및 환경변수 설정
- [ ] `CRON_SECRET` 생성 및 설정
- [ ] Vercel Cron 스케줄 설정 (`vercel.json`)
- [ ] 수동 Cron 실행 테스트
- [ ] API 응답 확인 (Cache HIT)

### 운영 중
- [ ] 매일 Cron 실행 로그 확인
- [ ] Cache Hit Rate 모니터링
- [ ] Redis 용량 모니터링 (Vercel KV Dashboard)
- [ ] Snowflake 크레딧 사용량 확인

---

## 🔐 보안

### 민감 정보 보호
- 로그에 `KV_REST_API_TOKEN` 절대 출력 안함
- 로그에 `CRON_SECRET` 출력 안함
- Snowflake 연결 정보 로그 안함

### Cron 보안
- `CRON_SECRET` 필수
- URL parameter 또는 header로 전달
- 401 Unauthorized 반환 (인증 실패 시)

---

## 📚 관련 파일

```
lib/
  ├── redis.ts              # Redis 클라이언트 (Vercel KV)
  ├── cache.ts              # 캐시 키 빌더
  ├── redisSnapshot.ts      # gzip 압축/해제
  ├── section3Query.ts      # Snowflake 쿼리 실행
  └── date-utils.ts         # 날짜 계산 (KST)

app/api/
  ├── cron/
  │   └── section3-snapshot/
  │       └── route.ts      # Cron Job
  └── section3/
      └── old-season-inventory/
          └── route.ts      # API 엔드포인트
```

---

## 📞 연락처

문제 발생 시:
1. Vercel Dashboard → Logs 확인
2. Redis 상태 확인 (Upstash Console)
3. Snowflake 쿼리 히스토리 확인

---

**마지막 업데이트:** 2026-02-15
**작성자:** FNF HKMC Dashboard Team
