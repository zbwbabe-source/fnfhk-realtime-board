import exchangeRateData from '../data/tw_exchange_rate.json';

/**
 * 환율 데이터 (YYMM -> Rate)
 */
const exchangeRates: { [key: string]: number } = exchangeRateData;

/**
 * Date 객체에서 YYMM 형식의 기간 문자열 추출
 * @param date - Date 객체
 * @returns YYMM 형식 문자열 (예: "2602")
 */
export function getCurrentPeriod(date: Date): string {
  const year = date.getFullYear() % 100; // 2026 -> 26
  const month = date.getMonth() + 1; // 0-based to 1-based
  return `${year.toString().padStart(2, '0')}${month.toString().padStart(2, '0')}`;
}

/**
 * 날짜 문자열(YYYY-MM-DD)에서 YYMM 형식 추출
 * @param dateStr - 날짜 문자열 (예: "2026-02-11")
 * @returns YYMM 형식 문자열 (예: "2602")
 */
export function getPeriodFromDateString(dateStr: string): string {
  const date = new Date(dateStr);
  return getCurrentPeriod(date);
}

/**
 * 특정 기간의 환율 조회
 * @param period - YYMM 형식 문자열 (예: "2602")
 * @returns TWD → HKD 환율 (없으면 가장 최근 환율 반환)
 */
export function getExchangeRate(period: string): number {
  // 해당 기간의 환율이 있으면 반환
  if (exchangeRates[period]) {
    return exchangeRates[period];
  }

  // 없으면 가장 최근 환율 반환
  const periods = Object.keys(exchangeRates).sort().reverse();
  if (periods.length > 0) {
    console.warn(`⚠️ 환율 데이터 없음 (${period}), 최근 환율 사용: ${periods[0]} = ${exchangeRates[periods[0]]}`);
    return exchangeRates[periods[0]];
  }

  // 환율 데이터가 전혀 없으면 기본값 (0.25)
  console.error('❌ 환율 데이터 없음, 기본값 0.25 사용');
  return 0.25;
}

/**
 * TWD 금액을 HKD로 변환
 * @param twdAmount - TWD 금액
 * @param period - YYMM 형식 문자열 (예: "2602")
 * @returns HKD 금액 (TWD × 환율)
 */
export function convertTwdToHkd(twdAmount: number | null, period: string): number | null {
  if (twdAmount === null || twdAmount === undefined) {
    return null;
  }

  const rate = getExchangeRate(period);
  return twdAmount * rate;
}

/**
 * 날짜 문자열을 받아서 TWD를 HKD로 변환
 * @param twdAmount - TWD 금액
 * @param dateStr - 날짜 문자열 (예: "2026-02-11")
 * @returns HKD 금액
 */
export function convertTwdToHkdByDate(twdAmount: number | null, dateStr: string): number | null {
  if (twdAmount === null || twdAmount === undefined) {
    return null;
  }

  const period = getPeriodFromDateString(dateStr);
  return convertTwdToHkd(twdAmount, period);
}

/**
 * 환율 데이터 전체 조회 (디버깅용)
 */
export function getAllExchangeRates(): { [key: string]: number } {
  return exchangeRates;
}
