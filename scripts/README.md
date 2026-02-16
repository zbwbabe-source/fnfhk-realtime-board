# 운영 점검 스크립트 사용 가이드

## 📁 파일 구조
```
scripts/
├── deploy-check.md          # 상세 점검 가이드 문서
├── check-deployment.ps1     # 자동 점검 스크립트 (PowerShell)
└── README.md                # 이 파일
```

## 🚀 빠른 시작

### 1. 배포 후 즉시 실행
```powershell
# PowerShell에서 실행
cd D:\Cursor_work_space\fnfhk_Realtime_Dashboard\scripts

# 도메인 입력하여 실행
.\check-deployment.ps1 -Domain "your-project.vercel.app"
```

### 2. 예상 출력
```
========================================
🚀 배포 후 운영 점검 시작
========================================
Domain: your-project.vercel.app
Time: 2025-02-16 15:30:00

[1/3] CRON 수동 실행 테스트...
----------------------------------------
✅ CRON 실행 완료 (소요시간: 18.5초)

결과 요약:
  - 총 타겟: 12
  - 성공: 12
  - 실패: 0
  ...

[2/3] 캐시 상태 모니터링...
----------------------------------------
✅ 캐시 상태 조회 완료

오늘의 캐시 통계 (2025-02-16):
  - HIT: 45
  - MISS: 3
  - REFRESH: 2
  - HIT 비율: 90.0%
  ...

[3/3] API 응답 속도 테스트...
----------------------------------------
✅ API 응답 완료
  - 응답 시간: 120ms
  → 캐시 HIT 가능성 높음 ✅

========================================
📊 최종 결과
========================================
1. CRON 실행: ✅ 통과
2. 캐시 상태: ✅ 통과
3. API 응답: ✅ 통과

🎉 모든 점검 항목 통과! 배포 성공!
```

## 📋 점검 항목 상세

### ✅ 1. CRON 실행 테스트
- `/api/cron/insights-summary` 엔드포인트 호출
- 12개 타겟 (3일 × 2 region × 2 brand) 캐시 생성
- 실패 건수 확인

**정상 기준:**
- 성공: 12개
- 실패: 0개
- 소요시간: < 30초

### ✅ 2. 캐시 상태 모니터링
- `/api/ops/insights-summary-status` 엔드포인트 조회
- 오늘의 HIT/MISS/REFRESH 통계 확인
- HIT 비율 계산

**정상 기준:**
- HIT 비율: ≥ 70%
- 권장 조치: "정상: 캐시 상태 양호"

### ✅ 3. API 응답 속도
- `/api/insights/summary` 엔드포인트 테스트
- 응답 시간 측정
- 캐시 HIT 여부 추정

**정상 기준:**
- 응답 시간: < 500ms (캐시 HIT)
- 응답 시간: < 2000ms (캐시 MISS, 허용 범위)

## 🔧 문제 해결

### ❌ CRON 실행 실패 (401 Unauthorized)
**원인:** CRON_SECRET 불일치

**해결:**
1. Vercel Dashboard → Settings → Environment Variables
2. CRON_SECRET 값 확인
3. 스크립트 파라미터 수정:
   ```powershell
   .\check-deployment.ps1 -Domain "your-project.vercel.app" -CronSecret "실제_시크릿_값"
   ```

### ❌ 캐시 HIT 비율 낮음 (< 70%)
**원인:** CRON 미실행 또는 캐시 만료

**해결:**
1. CRON 수동 실행 후 재확인
2. Vercel Dashboard → Cron Jobs에서 스케줄 확인
3. Redis 연결 상태 확인

### ❌ API 응답 느림 (> 2초)
**원인:** 캐시 MISS 또는 OpenAI 호출

**해결:**
1. CRON이 해당 날짜를 prewarm했는지 확인
2. 캐시 TTL 증가 고려 (600초 → 3600초)
3. OpenAI API 상태 확인

## 📅 일일 점검 자동화

### Windows Task Scheduler 설정
```powershell
# 작업 생성
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File D:\Cursor_work_space\fnfhk_Realtime_Dashboard\scripts\check-deployment.ps1 -Domain your-project.vercel.app"
$trigger = New-ScheduledTaskTrigger -Daily -At 9AM
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "FNF Dashboard Health Check" -Description "Daily dashboard health check"
```

### 실행 시간 권장
- **오전 9시**: CRON 실행 후 (00:10 UTC = 09:10 KST)
- **오후 3시**: CRON 실행 후 (06:10 UTC = 15:10 KST)
- **오후 9시**: CRON 실행 후 (12:10 UTC = 21:10 KST)

## 🔗 관련 문서

- [상세 점검 가이드](./deploy-check.md) - 전체 점검 프로세스
- [Vercel Cron 문서](https://vercel.com/docs/cron-jobs)
- [Upstash Redis 문서](https://upstash.com/docs/redis)

## 💡 팁

1. **첫 배포 후**: 즉시 스크립트 실행하여 CRON 동작 확인
2. **정기 점검**: 매일 1회 이상 실행 (자동화 권장)
3. **문제 발생 시**: Vercel Logs에서 상세 에러 확인
4. **성능 모니터링**: HIT 비율 트렌드 추적

## 📞 지원

문제가 지속되면:
1. Vercel Dashboard → Logs 확인
2. Redis Console → Data Browser 확인
3. OpenAI API 상태 확인
4. GitHub Issues 등록

---

작성일: 2025-02-16
최종 수정: 2025-02-16
