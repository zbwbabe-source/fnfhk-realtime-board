export type InsightTone = 'positive' | 'neutral' | 'warning' | 'critical';

export interface ExecutiveInsightBlock {
  id: 'sales' | 'season' | 'old';
  label: string;
  tone: InsightTone;
  text: string;
}

export interface ExecutiveInsightAction {
  priority: 'HKMC-1' | 'HKMC-2' | 'TW-1' | 'TW-2';
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
  seasonSellthrough?: number | null;
  oldStock?: number | null;
  invDays?: number | null;
  stagnantRatio?: number | null;
}

export interface ExecutiveInsightInput {
  region?: string;
  brand: string;
  asOfDate: string;
  mode?: 'MTD' | 'YTD';
  isToday?: boolean;
  hkmc: ExecutiveRegionInput;
  tw: ExecutiveRegionInput;
}
