# 🚀 배포 후 운영 점검 실행 가이드

## 현재 설정 확인

### ✅ CRON 설정 (vercel.json)
```json
{
  "path": "/api/cron/insights-summary",
  "schedule": "10 */6 * * *"  // 매 6시간마다 10분에 실행 (UTC)
}
```

**실행 시간 (UTC → KST):**
- 00:10 UTC = 09:10 KST
- 06:10 UTC = 15:10 KST
- 12:10 UTC = 21:10 KST
- 18:10 UTC = 03:10 KST (다음날)

### ✅ 환경 변수
- CRON_SECRET: `fnf_hkmc_dashboard_secret_2026`
- SUMMARY_SNAPSHOT_DAYS: 3 (기본값, 최근 3일 prewarm)
- SUMMARY_CRON_PARALLEL: true (병렬 처리)

---

## 📋 점검 체크리스트

### 1️⃣ CRON 수동 실행 테스트

**명령어 (PowerShell):**
```powershell
# 프로덕션 URL로 변경 필요
$cronSecret = "fnf_hkmc_dashboard_secret_2026"
$response = Invoke-WebRequest -Uri "https://YOUR-DOMAIN.vercel.app/api/cron/insights-summary?secret=$cronSecret" -Method GET
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**예상 응답:**
```json
{
  "ok": true,
  "generated": [
    {
      "region": "HKMC",
      "brand": "M",
      "date": "2025-02-16",
      "status": "ok",
      "duration_ms": 2341
    },
    // ... 총 12개 (3일 × 2 region × 2 brand)
  ],
  "stats": {
    "total_targets": 12,
    "success_count": 12,
    "error_count": 0,
    "duration_ms": 15234,
    "days": 3,
    "parallel": true
  }
}
```

**정상 기준:**
- ✅ `ok: true`
- ✅ `success_count: 12` (3일 × 2 region × 2 brand)
- ✅ `error_count: 0`
- ✅ `duration_ms < 30000` (30초 이내)

---

### 2️⃣ 캐시 상태 모니터링

**명령어:**
```powershell
$response = Invoke-WebRequest -Uri "https://YOUR-DOMAIN.vercel.app/api/ops/insights-summary-status" -Method GET
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**예상 응답:**
```json
{
  "last_run": {
    "timestamp": "2025-02-16T06:10:00.000Z",
    "success_count": 12,
    "error_count": 0,
    "duration_ms": 15234
  },
  "today": {
    "date": "2025-02-16",
    "hit": 45,
    "miss": 3,
    "refresh": 2
  },
  "hit_rate": 90.0,
  "recommended_action": "정상: 캐시 상태 양호"
}
```

**정상 기준:**
- ✅ `hit_rate >= 70%`
- ✅ `last_run.error_count: 0`
- ✅ `recommended_action: "정상: 캐시 상태 양호"`

---

### 3️⃣ 대시보드 첫 진입 테스트

**테스트 절차:**
1. Chrome 시크릿 모드 실행
2. F12 → Network 탭 열기
3. `https://YOUR-DOMAIN.vercel.app` 접속
4. "AI 요약 보기" 버튼 클릭
5. `/api/insights/summary` 요청 확인

**Network 탭 확인 사항:**
- Request URL: `/api/insights/summary`
- Method: POST
- Status: 200
- Time (Waiting): **< 500ms** ✅
- Response Preview에서 `main_summary`, `key_insights` 확인

**Vercel Logs 확인:**
```
[REQ] insights/summary { region: 'HKMC', brand: 'M', asof_date: '2025-02-16', skip_cache: false }
[CACHE HIT] insights/summary [insights:summary:HKMC:M:2025-02-16] - 87ms
```

**정상 기준:**
- ✅ `[CACHE HIT]` 메시지 존재
- ✅ 응답 시간 < 500ms
- ✅ UI에 요약이 즉시 표시 (스켈레톤 없음)

---

## 🔧 Vercel Dashboard 설정 확인

### Step 1: Environment Variables
```
Vercel Dashboard → Project → Settings → Environment Variables

필수 확인:
□ CRON_SECRET (Production)
□ OPENAI_API_KEY (Production)
□ KV_REST_API_URL (Production)
□ KV_REST_API_TOKEN (Production)
□ SNOWFLAKE_* (모든 연결 정보)
```

### Step 2: Cron Jobs
```
Vercel Dashboard → Project → Cron Jobs 탭

확인:
□ insights-summary CRON이 활성화되어 있는지
□ 마지막 실행 시간 확인
□ 실행 로그에서 에러 없는지 확인
```

### Step 3: Logs
```
Vercel Dashboard → Project → Logs

필터 적용:
- Search: "[CRON START]" 또는 "insights-summary"
- Time Range: Last 24 hours

확인:
□ CRON 실행 로그 존재
□ [CRON COMPLETE] 메시지 확인
□ 에러 없이 완료
```

---

## 🚨 문제 해결 가이드

### 문제 1: CRON이 실행 안됨
**증상:** Vercel Logs에 CRON 관련 로그 없음

**원인 확인:**
1. `vercel.json` 파일이 배포되었는지 확인
2. CRON_SECRET 환경변수 설정 확인
3. Vercel Cron 기능이 활성화되어 있는지 확인

**해결:**
```bash
# vercel.json 확인
cat vercel.json

# 재배포
git commit --allow-empty -m "trigger redeploy for cron"
git push origin main
```

---

### 문제 2: 캐시 HIT 비율 낮음 (< 70%)
**증상:** `/api/ops/insights-summary-status`에서 `hit_rate < 70`

**원인 확인:**
1. CRON이 정상 실행되었는지 확인
2. Redis 연결 상태 확인
3. 캐시 키 불일치 확인

**해결:**
```powershell
# CRON 수동 실행으로 캐시 재생성
$cronSecret = "fnf_hkmc_dashboard_secret_2026"
Invoke-WebRequest -Uri "https://YOUR-DOMAIN.vercel.app/api/cron/insights-summary?secret=$cronSecret"

# 5분 후 다시 상태 확인
Invoke-WebRequest -Uri "https://YOUR-DOMAIN.vercel.app/api/ops/insights-summary-status"
```

---

### 문제 3: 응답 시간 느림 (> 2초)
**증상:** Network 탭에서 Waiting 시간이 2초 이상

**원인 확인:**
1. Vercel Logs에서 `[CACHE MISS]` 확인
2. OpenAI API 호출 여부 확인
3. Redis 지연 확인

**해결:**
1. CRON 실행 시간을 데이터 업데이트 이후로 조정
2. 캐시 TTL을 600초 → 3600초로 증가
3. Redis 인스턴스 업그레이드 고려

---

## 📊 일일 점검 스크립트

**파일 생성: `scripts/daily-check.ps1`**
```powershell
# 배포 URL 설정
$baseUrl = "https://YOUR-DOMAIN.vercel.app"

Write-Host "=== 캐시 상태 확인 ===" -ForegroundColor Green
$status = Invoke-RestMethod -Uri "$baseUrl/api/ops/insights-summary-status"
Write-Host "HIT 비율: $($status.hit_rate)%" -ForegroundColor Cyan
Write-Host "권장 조치: $($status.recommended_action)" -ForegroundColor Yellow

if ($status.hit_rate -lt 70) {
    Write-Host "⚠️ 경고: HIT 비율이 70% 미만입니다!" -ForegroundColor Red
}

Write-Host "`n=== 마지막 CRON 실행 ===" -ForegroundColor Green
if ($status.last_run) {
    Write-Host "실행 시간: $($status.last_run.timestamp)"
    Write-Host "성공: $($status.last_run.success_count) / 실패: $($status.last_run.error_count)"
} else {
    Write-Host "⚠️ CRON 실행 기록 없음!" -ForegroundColor Red
}
```

---

## ✅ 최종 체크리스트

배포 완료 후 다음 항목을 순서대로 확인:

```
□ 1. CRON 수동 실행 테스트 (성공 확인)
□ 2. 캐시 상태 모니터링 (HIT 비율 70% 이상)
□ 3. 대시보드 첫 진입 테스트 (응답 시간 < 500ms)
□ 4. Vercel Dashboard 환경변수 확인
□ 5. Vercel Cron Jobs 활성화 확인
□ 6. Vercel Logs에서 에러 없는지 확인
□ 7. 일일 점검 스크립트 설정
```

모든 항목이 체크되면 배포 완료! 🎉
