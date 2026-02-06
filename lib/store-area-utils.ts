/**
 * 매장 면적 관련 유틸리티 함수
 * 
 * - 면적 단위: 평 (pyeong)
 * - 평당매출은 일일 기준으로 표준화
 * - 면적은 월별로 동적 변경 가능 (CSV의 YYMM 컬럼 기준)
 */

import storeAreaData from '@/data/store_area.json';

interface StoreAreaInfo {
  country: string;
  channel: string;
  areas: {
    [yearMonth: string]: number | null; // "2401", "2402", ...
  };
}

/**
 * YYMM 형식 변환 (Date → "2401" 형식)
 * 
 * @param date - 날짜
 * @returns YYMM 문자열 (예: "2602")
 */
function formatYYMM(date: Date): string {
  const year = date.getFullYear().toString().slice(-2); // 뒤 2자리
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * 매장 면적 조회 (평 단위) - 월별 동적
 * 
 * @param storeCode - 매장 코드 (예: 'M18', 'MC1')
 * @param asofDate - 기준일 (해당 월의 면적 조회)
 * @returns 면적(평) 또는 null (면적 정보 없음)
 * 
 * @example
 * getStoreArea('M18', new Date('2026-02-15')) // 2602(2026년 2월) 면적 반환
 */
export function getStoreArea(storeCode: string, asofDate?: Date): number | null {
  const storeInfo = (storeAreaData.stores as Record<string, StoreAreaInfo>)[storeCode];
  
  if (!storeInfo) {
    return null;
  }

  // asofDate가 없으면 최신 월 면적 사용
  if (!asofDate) {
    const months = Object.keys(storeInfo.areas).sort().reverse();
    for (const month of months) {
      if (storeInfo.areas[month] !== null) {
        return storeInfo.areas[month];
      }
    }
    return null;
  }

  // 해당 월의 면적 조회
  const yearMonth = formatYYMM(asofDate);
  const area = storeInfo.areas[yearMonth];
  
  // 해당 월 데이터가 없으면 가장 가까운 과거 월 사용
  if (area === null || area === undefined) {
    const months = Object.keys(storeInfo.areas).sort();
    let closestMonth: string | null = null;
    
    for (const month of months) {
      if (month <= yearMonth && storeInfo.areas[month] !== null) {
        closestMonth = month;
      }
    }
    
    return closestMonth ? storeInfo.areas[closestMonth] : null;
  }
  
  return area;
}

/**
 * 매장 정보 조회 (면적 + 국가 + 채널)
 * 
 * @param storeCode - 매장 코드
 * @returns 매장 정보 또는 null
 */
export function getStoreInfo(storeCode: string): StoreAreaInfo | null {
  const storeInfo = (storeAreaData.stores as Record<string, StoreAreaInfo>)[storeCode];
  return storeInfo || null;
}

/**
 * MTD 일수 계산 (당월 1일 ~ asof_date)
 * 
 * @param asofDate - 기준일
 * @returns 일수 (1~31)
 * 
 * @example
 * getMtdDays(new Date('2026-02-15')) // 15
 */
export function getMtdDays(asofDate: Date): number {
  return asofDate.getDate();
}

/**
 * YTD 일수 계산 (1월 1일 ~ asof_date)
 * 
 * @param asofDate - 기준일
 * @returns 일수 (1~365/366)
 * 
 * @example
 * getYtdDays(new Date('2026-02-15')) // 46 (1/1~2/15)
 */
export function getYtdDays(asofDate: Date): number {
  const year = asofDate.getFullYear();
  const startOfYear = new Date(year, 0, 1); // 1월 1일
  
  // 밀리초 차이를 일수로 변환
  const diffMs = asofDate.getTime() - startOfYear.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1은 시작일 포함
  
  return diffDays;
}

/**
 * 일일 표준화 평당매출 계산
 * 
 * 공식: 실판매출 / 매장면적(평) / 영업일수
 * 
 * @param sales - 실판매출 (HKD)
 * @param storeCode - 매장 코드
 * @param daysCount - 영업일수 (MTD: 당월 일수, YTD: 연초부터 일수)
 * @param asofDate - 기준일 (해당 월의 면적 사용)
 * @returns 평당매출/1일 (HKD/평/일) 또는 null (계산 불가)
 * 
 * @example
 * // MTD 예시: 2월 15일까지 1,500,000 HKD 매출, 2월 면적 30평
 * calculateSalesPerAreaPerDay(1500000, 'M18', 15, new Date('2026-02-15'))
 * // → 1,500,000 / 32 / 15 = 3,125 HKD/평/일
 * 
 * @example
 * // YTD 예시: 1월 1일~2월 15일(46일) 동안 5,000,000 HKD 매출
 * // 면적은 해당 기간의 가중평균 또는 최종일 기준 사용
 * calculateSalesPerAreaPerDay(5000000, 'M18', 46, new Date('2026-02-15'))
 * // → 5,000,000 / 32 / 46 = 3,397 HKD/평/일
 */
export function calculateSalesPerAreaPerDay(
  sales: number,
  storeCode: string,
  daysCount: number,
  asofDate: Date
): number | null {
  // 유효성 검사
  if (sales < 0 || daysCount <= 0) {
    return null;
  }

  const area = getStoreArea(storeCode, asofDate);
  
  // 면적 정보 없음
  if (area === null || area <= 0) {
    return null;
  }

  // 평당매출/1일 계산
  const salesPerAreaPerDay = sales / area / daysCount;
  
  return salesPerAreaPerDay;
}

/**
 * 온라인 채널 여부 확인
 * 
 * @param storeCode - 매장 코드
 * @returns true: 온라인 채널, false: 오프라인 매장
 */
export function isOnlineChannel(storeCode: string): boolean {
  const storeInfo = getStoreInfo(storeCode);
  
  if (!storeInfo) {
    return false;
  }
  
  return storeInfo.channel === '온라인';
}

/**
 * 평당매출 계산 가능 여부 확인
 * 
 * @param storeCode - 매장 코드
 * @param asofDate - 기준일 (선택사항)
 * @returns true: 계산 가능, false: 계산 불가 (온라인 또는 면적 없음)
 */
export function canCalculateSalesPerArea(storeCode: string, asofDate?: Date): boolean {
  // 온라인 채널은 면적 개념 없음
  if (isOnlineChannel(storeCode)) {
    return false;
  }

  const area = getStoreArea(storeCode, asofDate);
  
  // 면적 정보 없거나 0 이하
  if (area === null || area <= 0) {
    return false;
  }

  return true;
}

/**
 * 숫자 포맷팅 (천 단위 구분자)
 * 
 * @param value - 숫자
 * @param decimals - 소수점 자릿수 (기본값: 0)
 * @returns 포맷된 문자열
 * 
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234.567, 2) // "1,234.57"
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 평당매출 포맷팅 (HKD/평/일)
 * 
 * @param value - 평당매출/1일
 * @returns 포맷된 문자열
 * 
 * @example
 * formatSalesPerArea(3125.67) // "3,126"
 */
export function formatSalesPerArea(value: number): string {
  return formatNumber(Math.round(value), 0);
}
