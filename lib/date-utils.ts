/**
 * 시즌 코드 계산 함수
 * 
 * 시즌 판단 규칙:
 * - 9~12월: YYF (Fall/Winter)
 * - 1~2월: (YY-1)F (전년도 Fall/Winter)
 * - 3~8월: YYS (Spring/Summer)
 * 
 * 예시:
 * - 2025년 1월 -> 24F
 * - 2025년 3월 -> 25S
 * - 2025년 9월 -> 25F
 * - 2026년 2월 -> 25F
 */
export function getSeasonCode(date: Date): string {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  const yy = year % 100; // 2자리 연도

  if (month >= 9 && month <= 12) {
    // 9~12월: YYF
    return `${yy}F`;
  } else if (month >= 1 && month <= 2) {
    // 1~2월: (YY-1)F
    const prevYY = (year - 1) % 100;
    return `${prevYY}F`;
  } else {
    // 3~8월: YYS
    return `${yy}S`;
  }
}

/**
 * 시즌 시작일 계산 함수
 * 
 * 시즌별 시작 월:
 * - YYF (Fall/Winter): 9월 1일
 * - YYS (Spring/Summer): 3월 1일
 * 
 * 예시:
 * - 25F -> 2025-09-01
 * - 26S -> 2026-03-01
 */
export function getSeasonStartDate(date: Date): Date {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month >= 9 && month <= 12) {
    // 9~12월: 해당 연도 9월 1일
    return new Date(year, 8, 1); // month는 0-based
  } else if (month >= 1 && month <= 2) {
    // 1~2월: 전년도 9월 1일
    return new Date(year - 1, 8, 1);
  } else {
    // 3~8월: 해당 연도 3월 1일
    return new Date(year, 2, 1);
  }
}

/**
 * 섹션2 계산용 시작일 (시즌 시작일)
 * 
 * 예시:
 * - 2026-01-31 선택 -> 25F 시즌 시작: 2025-09-01
 * - 2026-05-15 선택 -> 26S 시즌 시작: 2026-03-01
 */
export function getSection2StartDate(date: Date): Date {
  return getSeasonStartDate(date);
}

/**
 * 날짜 문자열을 YYYY-MM-DD 형식으로 포맷
 */
export function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 어제 날짜 반환 (한국 시간대 기준 KST/UTC+9)
 * Vercel 서버는 UTC 기준이므로 한국 시간대로 변환 필요
 */
export function getYesterday(): Date {
  // 현재 UTC 시간에 9시간(한국 시간대) 더하기
  const now = new Date();
  const kstOffset = 9 * 60; // 분 단위
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kstTime = new Date(utcTime + (kstOffset * 60000));
  
  console.log('🕐 Date calculation:', {
    serverTime: now.toISOString(),
    kstTime: kstTime.toISOString(),
    kstDate: formatDateYYYYMMDD(kstTime),
  });
  
  // KST 기준 어제
  kstTime.setDate(kstTime.getDate() - 1);
  kstTime.setHours(0, 0, 0, 0); // 자정으로 설정
  
  console.log('📅 Yesterday (KST):', formatDateYYYYMMDD(kstTime));
  
  return kstTime;
}

/**
 * 날짜 차이 계산 (일 단위)
 */
export function getDaysDiff(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 월 시작일 반환
 */
export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * 작년 동일 날짜 반환
 */
export function getLastYearDate(date: Date): Date {
  return new Date(date.getFullYear() - 1, date.getMonth(), date.getDate());
}

/**
 * 날짜 유효성 검증 (최대 어제까지)
 */
export function isValidDateSelection(dateStr: string): boolean {
  try {
    const selected = new Date(dateStr);
    const yesterday = getYesterday();
    yesterday.setHours(23, 59, 59, 999);
    
    return selected <= yesterday;
  } catch {
    return false;
  }
}

/**
 * 사용 가능한 날짜 목록 생성 (최근 370일, 어제까지)
 */
export function getAvailableDates(): string[] {
  const dates: string[] = [];
  const yesterday = getYesterday();
  
  for (let i = 0; i < 370; i++) {
    const date = new Date(yesterday);
    date.setDate(date.getDate() - i);
    dates.push(formatDateYYYYMMDD(date));
  }
  
  return dates;
}

function getMonthEndDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function buildSnapshotTargetDates(
  baseDate: Date,
  recentDays: number,
  recentMonthEnds: number
): string[] {
  const normalizedRecentDays = Math.max(1, Math.min(30, Math.trunc(recentDays || 1)));
  const normalizedRecentMonthEnds = Math.max(0, Math.min(24, Math.trunc(recentMonthEnds || 0)));
  const keys = new Set<string>();

  for (let i = 0; i < normalizedRecentDays; i += 1) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    keys.add(formatDateYYYYMMDD(date));
  }

  for (let i = 0; i < normalizedRecentMonthEnds; i += 1) {
    const anchor = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    const monthEnd = getMonthEndDate(anchor);
    if (monthEnd > baseDate) {
      continue;
    }
    keys.add(formatDateYYYYMMDD(monthEnd));
  }

  return [...keys].sort((a, b) => b.localeCompare(a));
}
