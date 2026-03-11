import { executeSnowflakeQuery } from '@/lib/snowflake';

type ProjectionWeightOptions = {
  region: string;
  brand: string;
  date: string;
  storeCodes: string[];
};

type ProjectionWeightMeta = {
  trainingYears: number[];
  methodSummary: string;
  explanation: string;
};

type ProjectionWeightResult = {
  weightMap: Map<string, number>;
  meta: ProjectionWeightMeta;
};

const projectionCache = new Map<string, ProjectionWeightResult>();

const CNY_DATES: Record<number, string> = {
  2024: '2024-02-10',
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const endOfMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: endOfMonth }, (_, index) => new Date(year, month - 1, index + 1));
}

function getDomBucket(dayOfMonth: number): '1_10' | '11_20' | '21_EOM' {
  if (dayOfMonth <= 10) return '1_10';
  if (dayOfMonth <= 20) return '11_20';
  return '21_EOM';
}

function getCnyBucket(date: Date): 'cny_core' | 'cny_shoulder' | 'normal' {
  const cnyDateText = CNY_DATES[date.getFullYear()];
  if (!cnyDateText) return 'normal';

  const cnyDate = new Date(`${cnyDateText}T00:00:00`);
  const diffDays = Math.round((date.getTime() - cnyDate.getTime()) / 86400000);

  if (diffDays >= -1 && diffDays <= 5) return 'cny_core';
  if (diffDays >= -7 && diffDays <= 10) return 'cny_shoulder';
  return 'normal';
}

function normalizeWeights(weightMap: Map<string, number>, year: number, month: number): Map<string, number> {
  const monthDates = getDaysInMonth(year, month);
  const rawWeights = monthDates.map((date) => weightMap.get(formatDate(date)) || 1);
  const averageWeight = rawWeights.length > 0
    ? rawWeights.reduce((sum, weight) => sum + weight, 0) / rawWeights.length
    : 1;

  if (!isFinite(averageWeight) || averageWeight <= 0) {
    return weightMap;
  }

  const normalized = new Map<string, number>();
  monthDates.forEach((date) => {
    const key = formatDate(date);
    const weight = weightMap.get(key) || 1;
    normalized.set(key, weight / averageWeight);
  });
  return normalized;
}

export async function buildProjectionWeightData({
  region,
  brand,
  date,
  storeCodes,
}: ProjectionWeightOptions): Promise<ProjectionWeightResult> {
  const cacheKey = `${region}|${brand}|${date}|${storeCodes.join(',')}`;
  const cached = projectionCache.get(cacheKey);
  if (cached) return cached;

  const asOfDate = new Date(`${date}T00:00:00`);
  const targetYear = asOfDate.getFullYear();
  const targetMonth = asOfDate.getMonth() + 1;
  const trainingYears = [targetYear - 2, targetYear - 1].filter((year) => year >= 2024);

  const defaultResult: ProjectionWeightResult = {
    weightMap: new Map(
      getDaysInMonth(targetYear, targetMonth).map((day) => [formatDate(day), 1])
    ),
    meta: {
      trainingYears,
      methodSummary: region === 'TW'
        ? '최근 2개년 동일월 실매출 기반 요일/월중구간/춘절 보정'
        : '최근 2개년 동일월 실매출 기반 요일/월중구간/춘절 보정',
      explanation: '최근 2개년 동일월 일별 실판매출을 학습해 요일, 월초/중순/월말 구간, 춘절 근접 구간을 반영한 환산계수입니다.',
    },
  };

  if (storeCodes.length === 0 || trainingYears.length === 0) {
    projectionCache.set(cacheKey, defaultResult);
    return defaultResult;
  }

  const sqlStoreCodes = storeCodes.map((storeCode) => `'${storeCode}'`).join(',');
  const yearConditions = trainingYears
    .map((year) => `SALE_DT BETWEEN TO_DATE('${year}-${String(targetMonth).padStart(2, '0')}-01') AND LAST_DAY(TO_DATE('${year}-${String(targetMonth).padStart(2, '0')}-01'))`)
    .join(' OR ');

  const query = `
    SELECT
      SALE_DT,
      SUM(ACT_SALE_AMT) AS sales_amt
    FROM SAP_FNF.DW_HMD_SALE_D
    WHERE
      (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
      AND LOCAL_SHOP_CD IN (${sqlStoreCodes})
      AND (${yearConditions})
    GROUP BY SALE_DT
    ORDER BY SALE_DT
  `;

  const rows = await executeSnowflakeQuery(query, [brand]);

  const dailyRows = rows
    .map((row: any) => {
      const saleDate = new Date(row.SALE_DT);
      const salesAmount = Number(row.SALES_AMT || 0);
      if (!isFinite(salesAmount)) return null;

      return {
        date: saleDate,
        salesAmount,
        dow: saleDate.getDay(),
        domBucket: getDomBucket(saleDate.getDate()),
        cnyBucket: getCnyBucket(saleDate),
      };
    })
    .filter(Boolean) as Array<{
      date: Date;
      salesAmount: number;
      dow: number;
      domBucket: '1_10' | '11_20' | '21_EOM';
      cnyBucket: 'cny_core' | 'cny_shoulder' | 'normal';
    }>;

  if (dailyRows.length === 0) {
    projectionCache.set(cacheKey, defaultResult);
    return defaultResult;
  }

  const baseline = dailyRows.reduce((sum, row) => sum + row.salesAmount, 0) / dailyRows.length;
  if (!isFinite(baseline) || baseline <= 0) {
    projectionCache.set(cacheKey, defaultResult);
    return defaultResult;
  }

  const domTotals = new Map<string, { sum: number; count: number }>();
  const dowTotals = new Map<number, { sum: number; count: number }>();
  const cnyTotals = new Map<string, { sum: number; count: number }>();

  dailyRows.forEach((row) => {
    const domStats = domTotals.get(row.domBucket) || { sum: 0, count: 0 };
    domStats.sum += row.salesAmount;
    domStats.count += 1;
    domTotals.set(row.domBucket, domStats);

    const dowStats = dowTotals.get(row.dow) || { sum: 0, count: 0 };
    dowStats.sum += row.salesAmount;
    dowStats.count += 1;
    dowTotals.set(row.dow, dowStats);

    const cnyStats = cnyTotals.get(row.cnyBucket) || { sum: 0, count: 0 };
    cnyStats.sum += row.salesAmount;
    cnyStats.count += 1;
    cnyTotals.set(row.cnyBucket, cnyStats);
  });

  const domFactors = new Map(
    [...domTotals.entries()].map(([bucket, stats]) => [bucket, stats.sum / stats.count / baseline])
  );
  const dowFactors = new Map(
    [...dowTotals.entries()].map(([dow, stats]) => [dow, stats.sum / stats.count / baseline])
  );
  const cnyFactors = new Map(
    [...cnyTotals.entries()].map(([bucket, stats]) => [bucket, stats.sum / stats.count / baseline])
  );

  const rawWeightMap = new Map<string, number>();
  getDaysInMonth(targetYear, targetMonth).forEach((monthDate) => {
    const domFactor = domFactors.get(getDomBucket(monthDate.getDate())) || 1;
    const dowFactor = dowFactors.get(monthDate.getDay()) || 1;
    const cnyFactor = cnyFactors.get(getCnyBucket(monthDate)) || 1;
    rawWeightMap.set(formatDate(monthDate), domFactor * dowFactor * cnyFactor);
  });

  const normalizedWeightMap = normalizeWeights(rawWeightMap, targetYear, targetMonth);

  const result: ProjectionWeightResult = {
    weightMap: normalizedWeightMap,
    meta: {
      trainingYears,
      methodSummary: '과거 2개년 동일월 실매출 + 요일 + 월중구간 + 춘절 보정',
      explanation:
        '전년/전전년 동일월 일별 실판매출을 기준으로 요일 효과, 월초·중순·월말 패턴, 춘절 인접 구간 영향을 반영해 당월 일자별 환산계수를 만들었습니다.',
    },
  };

  projectionCache.set(cacheKey, result);
  return result;
}

export function calculateMonthEndProjection(
  mtdActual: number,
  asOfDate: string,
  weightMap: Map<string, number>
): number {
  if (mtdActual === 0) return 0;

  const date = new Date(`${asOfDate}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const monthDates = getDaysInMonth(year, month);

  const fullWeight = monthDates.reduce((sum, monthDate) => {
    return sum + (weightMap.get(formatDate(monthDate)) || 1);
  }, 0);

  const cumulativeWeight = monthDates.reduce((sum, monthDate) => {
    return monthDate <= date ? sum + (weightMap.get(formatDate(monthDate)) || 1) : sum;
  }, 0);

  if (!isFinite(fullWeight) || !isFinite(cumulativeWeight) || fullWeight <= 0 || cumulativeWeight <= 0) {
    return mtdActual;
  }

  return mtdActual * (fullWeight / cumulativeWeight);
}

export function calculateProjectedYoY(
  currentMtd: number,
  lastYearMtd: number,
  asOfDate: string,
  weightMap: Map<string, number>
): number {
  const currentProjection = calculateMonthEndProjection(currentMtd, asOfDate, weightMap);

  const currentDate = new Date(`${asOfDate}T00:00:00`);
  const previousYearDate = new Date(currentDate);
  previousYearDate.setFullYear(currentDate.getFullYear() - 1);
  const previousYearDateText = formatDate(previousYearDate);

  const previousYearProjection = calculateMonthEndProjection(lastYearMtd, previousYearDateText, weightMap);
  if (previousYearProjection <= 0) return 0;

  return (currentProjection / previousYearProjection) * 100;
}
