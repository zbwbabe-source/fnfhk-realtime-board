export type InsightTone = 'positive' | 'neutral' | 'warning' | 'critical';

export interface ExecutiveInsightBlock {
  id: 'sales' | 'season' | 'old';
  label: string;
  tone: InsightTone;
  text: string;
}

export interface ExecutiveInsightAction {
  priority: 'HKMC' | 'TW';
  text: string;
}

export interface ExecutiveInsightMeta {
  model: string;
  cached: boolean;
  generatedAt: string;
  ttlSeconds: number;
}

export interface ExecutiveInsightResponse {
  title: 'Executive Insight';
  asOfLabel: string;
  summaryLine: string;
  compareLine: string;
  blocks: ExecutiveInsightBlock[];
  actions: ExecutiveInsightAction[];
  meta: ExecutiveInsightMeta;
}

export interface ExecutiveRegionInput {
  salesMtdYoy?: number | null;
  salesYtdYoy?: number | null;
  sameStoreMtdYoy?: number | null;
  sameStoreYtdYoy?: number | null;
  seasonSellthrough?: number | null;
  seasonSellthroughYoyPp?: number | null;
  seasonTopCategories?: string[];
  discountRateMtd?: number | null;
  discountRateYtd?: number | null;
  discountRateMtdDiff?: number | null;
  discountRateYtdDiff?: number | null;
  oldStock?: number | null;
  oldStockYoy?: number | null;
  invDays?: number | null;
  oldStock2yPlusShare?: number | null;
  oldStock3yPlusShare?: number | null;
  stagnantRatio?: number | null;
  stagnantRatioChange?: number | null; // %p (vs last month-end)
}

export interface ExecutiveInsightInput {
  region?: string;
  brand: string;
  asOfDate: string;
  mode?: 'MTD' | 'YTD';
  language?: 'ko' | 'en';
  isToday?: boolean;
  hkmc: ExecutiveRegionInput;
  tw: ExecutiveRegionInput;
}
