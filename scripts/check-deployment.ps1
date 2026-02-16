# 배포 후 운영 점검 스크립트
# PowerShell에서 실행

param(
    [string]$Domain = "YOUR-DOMAIN.vercel.app",
    [string]$CronSecret = "fnf_hkmc_dashboard_secret_2026"
)

$baseUrl = "https://$Domain"
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 배포 후 운영 점검 시작" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Domain: $Domain"
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ===========================
# 1. CRON 수동 실행 테스트
# ===========================
Write-Host "`n[1/3] CRON 수동 실행 테스트..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

try {
    $cronUrl = "$baseUrl/api/cron/insights-summary?secret=$CronSecret"
    Write-Host "요청 URL: $cronUrl"
    Write-Host "실행 중... (최대 5분 소요)" -ForegroundColor Gray
    
    $cronStart = Get-Date
    $cronResponse = Invoke-RestMethod -Uri $cronUrl -Method GET -TimeoutSec 300
    $cronDuration = ((Get-Date) - $cronStart).TotalSeconds
    
    Write-Host "✅ CRON 실행 완료 (소요시간: $([math]::Round($cronDuration, 2))초)" -ForegroundColor Green
    Write-Host ""
    Write-Host "결과 요약:" -ForegroundColor Cyan
    Write-Host "  - 총 타겟: $($cronResponse.stats.total_targets)"
    Write-Host "  - 성공: $($cronResponse.stats.success_count)" -ForegroundColor Green
    Write-Host "  - 실패: $($cronResponse.stats.error_count)" -ForegroundColor $(if ($cronResponse.stats.error_count -gt 0) { "Red" } else { "Green" })
    Write-Host "  - 생성 시간: $($cronResponse.stats.duration_ms)ms"
    Write-Host "  - 병렬 처리: $($cronResponse.stats.parallel)"
    Write-Host "  - 날짜 범위: $($cronResponse.stats.days)일"
    
    if ($cronResponse.stats.error_count -gt 0) {
        Write-Host "`n⚠️ 경고: 실패 건이 있습니다!" -ForegroundColor Red
        $errors = $cronResponse.generated | Where-Object { $_.status -eq 'error' }
        foreach ($err in $errors) {
            Write-Host "  - $($err.region):$($err.brand):$($err.date) - $($err.error)" -ForegroundColor Red
        }
    }
    
    $cronPassed = $cronResponse.stats.error_count -eq 0
} catch {
    Write-Host "❌ CRON 실행 실패: $($_.Exception.Message)" -ForegroundColor Red
    $cronPassed = $false
}

# ===========================
# 2. 캐시 상태 모니터링
# ===========================
Write-Host "`n[2/3] 캐시 상태 모니터링..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

try {
    $statusUrl = "$baseUrl/api/ops/insights-summary-status"
    Write-Host "요청 URL: $statusUrl"
    
    $statusResponse = Invoke-RestMethod -Uri $statusUrl -Method GET
    
    Write-Host "✅ 캐시 상태 조회 완료" -ForegroundColor Green
    Write-Host ""
    Write-Host "오늘의 캐시 통계 ($($statusResponse.today.date)):" -ForegroundColor Cyan
    Write-Host "  - HIT: $($statusResponse.today.hit)" -ForegroundColor Green
    Write-Host "  - MISS: $($statusResponse.today.miss)" -ForegroundColor Yellow
    Write-Host "  - REFRESH: $($statusResponse.today.refresh)" -ForegroundColor Blue
    Write-Host "  - HIT 비율: $($statusResponse.hit_rate)%" -ForegroundColor $(if ($statusResponse.hit_rate -ge 70) { "Green" } else { "Red" })
    
    Write-Host "`n권장 조치: $($statusResponse.recommended_action)" -ForegroundColor $(if ($statusResponse.recommended_action -match "정상") { "Green" } else { "Yellow" })
    
    if ($statusResponse.last_run) {
        Write-Host "`n마지막 CRON 실행:" -ForegroundColor Cyan
        Write-Host "  - 시간: $($statusResponse.last_run.timestamp)"
        Write-Host "  - 성공: $($statusResponse.last_run.success_count)"
        Write-Host "  - 실패: $($statusResponse.last_run.error_count)"
        Write-Host "  - 소요시간: $($statusResponse.last_run.duration_ms)ms"
    } else {
        Write-Host "`n⚠️ 마지막 CRON 실행 기록이 없습니다!" -ForegroundColor Red
    }
    
    $cachePassed = $statusResponse.hit_rate -ge 70 -or $statusResponse.today.hit + $statusResponse.today.miss + $statusResponse.today.refresh -eq 0
} catch {
    Write-Host "❌ 캐시 상태 조회 실패: $($_.Exception.Message)" -ForegroundColor Red
    $cachePassed = $false
}

# ===========================
# 3. API 응답 속도 테스트
# ===========================
Write-Host "`n[3/3] API 응답 속도 테스트..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

try {
    $summaryUrl = "$baseUrl/api/insights/summary"
    Write-Host "요청 URL: $summaryUrl"
    
    $testBody = @{
        region = "HKMC"
        brand = "M"
        asof_date = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
        section1 = @{
            achievement_rate = 95.5
            yoy_ytd = 105
            actual_sales_ytd = 1000000
            target_ytd = 1047619
            elapsed_days = 15
            total_days = 31
        }
        section2 = @{
            sellthrough_rate = 72.3
            sales_amt = 5000000
            inbound_amt = 6915000
            sales_yoy_pct = 108
        }
        section3 = @{
            sellthrough_rate = 65.5
            base_stock_amt = 3000000
            curr_stock_amt = 1035000
            stagnant_ratio = 15.5
            prev_month_stagnant_ratio = 18.2
        }
    }
    
    $apiStart = Get-Date
    $summaryResponse = Invoke-RestMethod -Uri $summaryUrl -Method POST -Body ($testBody | ConvertTo-Json -Depth 10) -ContentType "application/json"
    $apiDuration = ((Get-Date) - $apiStart).TotalMilliseconds
    
    Write-Host "✅ API 응답 완료" -ForegroundColor Green
    Write-Host "  - 응답 시간: $([math]::Round($apiDuration, 0))ms" -ForegroundColor $(if ($apiDuration -lt 500) { "Green" } elseif ($apiDuration -lt 2000) { "Yellow" } else { "Red" })
    Write-Host "  - 요약 길이: $($summaryResponse.main_summary.Length)자"
    Write-Host "  - 인사이트 수: $($summaryResponse.key_insights.Count)개"
    
    if ($apiDuration -lt 500) {
        Write-Host "  → 캐시 HIT 가능성 높음 ✅" -ForegroundColor Green
    } elseif ($apiDuration -lt 2000) {
        Write-Host "  → 캐시 MISS 또는 네트워크 지연 ⚠️" -ForegroundColor Yellow
    } else {
        Write-Host "  → OpenAI 호출 또는 타임아웃 위험 ❌" -ForegroundColor Red
    }
    
    $apiPassed = $apiDuration -lt 2000
} catch {
    Write-Host "❌ API 응답 테스트 실패: $($_.Exception.Message)" -ForegroundColor Red
    $apiPassed = $false
}

# ===========================
# 최종 결과
# ===========================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "📊 최종 결과" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$allPassed = $cronPassed -and $cachePassed -and $apiPassed

Write-Host "1. CRON 실행: " -NoNewline
Write-Host $(if ($cronPassed) { "✅ 통과" } else { "❌ 실패" }) -ForegroundColor $(if ($cronPassed) { "Green" } else { "Red" })

Write-Host "2. 캐시 상태: " -NoNewline
Write-Host $(if ($cachePassed) { "✅ 통과" } else { "❌ 실패" }) -ForegroundColor $(if ($cachePassed) { "Green" } else { "Red" })

Write-Host "3. API 응답: " -NoNewline
Write-Host $(if ($apiPassed) { "✅ 통과" } else { "❌ 실패" }) -ForegroundColor $(if ($apiPassed) { "Green" } else { "Red" })

Write-Host ""
if ($allPassed) {
    Write-Host "🎉 모든 점검 항목 통과! 배포 성공!" -ForegroundColor Green
} else {
    Write-Host "⚠️ 일부 항목 실패. 위의 로그를 확인하세요." -ForegroundColor Yellow
}

Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "  1. Vercel Dashboard → Logs에서 상세 로그 확인"
Write-Host "  2. 실제 대시보드 접속하여 UI 테스트"
Write-Host "  3. 일일 점검 스케줄 설정 (Windows Task Scheduler 등)"
Write-Host ""
