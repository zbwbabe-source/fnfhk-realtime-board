/**
 * 신규 매장 여부 확인 유틸리티
 */

/**
 * 해당 매장이 신규 매장인지 확인 (전년 매출 기준)
 * @param pyValue 전년 동기 매출 (Previous Year)
 * @returns 신규 매장 여부
 */
export function isNewStore(pyValue: number | null | undefined): boolean {
  // 전년 매출이 없거나 0이면 신규 매장
  return pyValue === null || pyValue === undefined || pyValue === 0;
}

/**
 * YoY 값 포맷팅 (신규 매장은 "신규" 표시)
 */
export function formatYoY(pyValue: number | null | undefined, yoyValue: number | null, language: 'ko' | 'en' = 'ko'): string {
  if (isNewStore(pyValue)) {
    return language === 'ko' ? '신규' : 'New';
  }
  
  if (yoyValue === null || yoyValue === undefined) {
    return 'N/A';
  }
  
  return `${yoyValue.toFixed(1)}%`;
}

/**
 * YoY 백분율 표시 (신규 매장은 null 반환)
 */
export function getYoYForChart(pyValue: number | null | undefined, yoyValue: number | null): number | null {
  if (isNewStore(pyValue)) {
    return null; // 차트에서 신규 매장은 YoY 라인 표시 안 함
  }
  
  return yoyValue;
}
