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
 * 날짜 문자열을 YYYY-MM-DD 형식으로 포맷
 */
export function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 어제 날짜 반환
 */
export function getYesterday(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date;
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
