/**
 * 가중치 데이터 로딩 및 월말환산 계산 유틸리티
 * - 일자별 가중치(주말/휴일 패턴)를 기반으로 월말 매출 추정
 */

// 가중치 데이터 캐시
let weightCache: Map<string, number> | null = null;

/**
 * CSV에서 가중치 데이터 로드 (캐싱)
 */
export async function loadWeightData(): Promise<Map<string, number>> {
  if (weightCache) {
    return weightCache;
  }

  try {
    const response = await fetch('/HKMCweight_2026_daily.csv');
    if (!response.ok) {
      throw new Error(`Failed to load weight data: ${response.statusText}`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    // 첫 줄은 헤더 (DATE,weight)
    const dataLines = lines.slice(1);
    
    const weightMap = new Map<string, number>();
    
    for (const line of dataLines) {
      const [dateStr, weightStr] = line.split(',');
      if (dateStr && weightStr) {
        const date = dateStr.trim();
        const weight = parseFloat(weightStr.trim());
        if (!isNaN(weight)) {
          weightMap.set(date, weight);
        }
      }
    }

    weightCache = weightMap;
    return weightMap;
  } catch (error) {
    console.error('Error loading weight data:', error);
    return new Map();
  }
}

/**
 * 날짜를 'YYYY-MM-DD' 형식으로 포맷
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 월말환산 계산
 * @param mtdActual - 당월 누적 실적 (MTD)
 * @param asOfDate - 기준일 ('YYYY-MM-DD')
 * @param weightMap - 일자별 가중치 맵
 * @returns 월말 환산 값
 */
export function calculateMonthEndProjection(
  mtdActual: number,
  asOfDate: string,
  weightMap: Map<string, number>
): number {
  if (mtdActual === 0) return 0;

  const date = new Date(asOfDate);
  const year = date.getFullYear();
  const month = date.getMonth();
  
  // 월초 ~ 월말
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  
  let fullWeight = 0;
  let cumWeight = 0;
  
  // 월 전체 가중치 합계
  const currentDate = new Date(startOfMonth);
  while (currentDate <= endOfMonth) {
    const key = formatDate(currentDate);
    const weight = weightMap.get(key) || 0;
    fullWeight += weight;
    
    // 누적 가중치 (asOfDate까지)
    if (currentDate <= date) {
      cumWeight += weight;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // 환산 계산
  if (cumWeight === 0 || fullWeight === 0) {
    return mtdActual; // fallback
  }
  
  return mtdActual * (fullWeight / cumWeight);
}

/**
 * 환산 YoY 계산
 * @param currentMtd - 당월 누적 실적
 * @param lastYearMtd - 전년동월 누적 실적
 * @param asOfDate - 기준일 ('YYYY-MM-DD')
 * @param weightMap - 일자별 가중치 맵
 * @returns 환산 YoY (백분율, 예: 105.3 = 105.3%)
 */
export function calculateProjectedYoY(
  currentMtd: number,
  lastYearMtd: number,
  asOfDate: string,
  weightMap: Map<string, number>
): number {
  // 당해년도 월말환산
  const currentProjection = calculateMonthEndProjection(currentMtd, asOfDate, weightMap);
  
  // 전년 동일 날짜 계산
  const date = new Date(asOfDate);
  const lyDate = new Date(date);
  lyDate.setFullYear(lyDate.getFullYear() - 1);
  const lyDateStr = formatDate(lyDate);
  
  // 전년도 월말환산
  const lyProjection = calculateMonthEndProjection(lastYearMtd, lyDateStr, weightMap);
  
  // YoY 계산
  if (lyProjection === 0) return 0;
  return (currentProjection / lyProjection) * 100;
}

/**
 * 서버 사이드에서 사용하는 동기 버전 (fetch 대신 fs 사용)
 */
export async function loadWeightDataServer(): Promise<Map<string, number>> {
  // Node.js 환경에서만 fs 사용
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const csvPath = path.join(process.cwd(), 'public', 'HKMCweight_2026_daily.csv');
      const csvText = fs.readFileSync(csvPath, 'utf-8');
      
      const lines = csvText.trim().split('\n');
      const dataLines = lines.slice(1);
      
      const weightMap = new Map<string, number>();
      
      for (const line of dataLines) {
        const [dateStr, weightStr] = line.split(',');
        if (dateStr && weightStr) {
          const date = dateStr.trim();
          const weight = parseFloat(weightStr.trim());
          if (!isNaN(weight)) {
            weightMap.set(date, weight);
          }
        }
      }
      
      return weightMap;
    } catch (error) {
      console.error('Error loading weight data (server):', error);
      return new Map();
    }
  }
  
  // 브라우저 환경에서는 fetch 사용
  return loadWeightData();
}
