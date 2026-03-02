import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildKey, cacheGet, cacheSet } from '@/lib/cache';
import { EXEC_INSIGHT_SYSTEM_PROMPT, EXEC_INSIGHT_USER_PROMPT } from '@/lib/insights/prompts';
import type {
  ExecutiveInsightBlock,
  ExecutiveInsightInput,
  ExecutiveInsightResponse,
  ExecutiveRegionInput,
  InsightTone,
} from '@/lib/insights/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'gpt-4o-mini';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EXEC_INSIGHT_USE_LLM = process.env.EXEC_INSIGHT_USE_LLM === 'true';
type InsightLanguage = 'ko' | 'en';

function clampText(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

function toNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fmtYoy(v: number | null): string {
  if (v === null) return 'N/A';
  return `${Math.round(v)}%`;
}

function fmtRate(v: number | null): string {
  if (v === null) return 'N/A';
  return `${v.toFixed(1)}%`;
}

function fmtPpDelta(v: number | null, language: InsightLanguage): string {
  if (v === null) return 'N/A';
  const sign = v > 0 ? '+' : '';
  return language === 'ko' ? `${sign}${v.toFixed(1)}%p` : `${sign}${v.toFixed(1)}pp`;
}

function fmtNum(v: number | null): string {
  if (v === null) return 'N/A';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function fmtDays(v: number | null): string {
  if (v === null) return 'N/A';
  return `${Math.round(v)}일`;
}

function fmtDaysByLang(v: number | null, language: InsightLanguage): string {
  if (v === null) return 'N/A';
  return language === 'ko' ? `${Math.round(v)}일` : `${Math.round(v)} days`;
}

function fmtSellWindowTurns(v: number | null): string {
  if (v === null) return 'N/A';
  return `${(v / 180).toFixed(1)}x`;
}

function formatOldPair(stock: number | null, days: number | null): string {
  if (stock === null && days === null) return '데이터 없음';
  if (stock === null || days === null) return '데이터 일부 없음';
  return `${fmtNum(stock)}·${fmtDays(days)}`;
}

function formatOldPairByLang(stock: number | null, days: number | null, language: InsightLanguage): string {
  if (stock === null && days === null) return language === 'ko' ? '데이터 없음' : 'No data';
  if (stock === null || days === null) return language === 'ko' ? '데이터 일부 없음' : 'Partial data missing';
  return `${fmtNum(stock)}·${fmtDaysByLang(days, language)}`;
}

function parseDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

type SeasonType = 'SS' | 'FW';

type SeasonWindow = {
  seasonType: SeasonType;
  start: Date;
  end: Date;
  startLabel: string;
  endLabel: string;
  elapsedDays: number;
  totalDays: number;
};

function toMonthDayLabel(utcDate: Date): string {
  return `${utcDate.getUTCMonth() + 1}/${utcDate.getUTCDate()}`;
}

function toIsoDate(utcDate: Date): string {
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolveSeasonWindow(asOfDate: string): SeasonWindow | null {
  const parts = parseDateParts(asOfDate);
  if (!parts) return null;
  const asOf = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  const seasonType: SeasonType = parts.month >= 3 && parts.month <= 8 ? 'SS' : 'FW';
  const seasonStartYear = seasonType === 'SS' ? parts.year : parts.month >= 9 ? parts.year : parts.year - 1;
  const seasonStart = seasonType === 'SS'
    ? new Date(Date.UTC(seasonStartYear, 2, 1)) // 3/1
    : new Date(Date.UTC(seasonStartYear, 8, 1)); // 9/1
  const seasonEnd = seasonType === 'SS'
    ? new Date(Date.UTC(seasonStartYear, 7, 31)) // 8/31
    : new Date(Date.UTC(seasonStartYear + 1, 2, 0)); // 2/28 or 2/29

  const clampedAsOf = asOf < seasonStart ? seasonStart : asOf > seasonEnd ? seasonEnd : asOf;
  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsed = Math.max(1, Math.floor((clampedAsOf.getTime() - seasonStart.getTime()) / msPerDay) + 1);
  const total = Math.max(1, Math.floor((seasonEnd.getTime() - seasonStart.getTime()) / msPerDay) + 1);

  return {
    seasonType,
    start: seasonStart,
    end: seasonEnd,
    startLabel: toMonthDayLabel(seasonStart),
    endLabel: toMonthDayLabel(seasonEnd),
    elapsedDays: elapsed,
    totalDays: total,
  };
}

function projectSeasonEndSellthrough(currentRate: number | null, seasonWindow: SeasonWindow | null): number | null {
  if (currentRate === null || !seasonWindow) return null;
  const { elapsedDays, totalDays } = seasonWindow;
  const projected = (currentRate / elapsedDays) * totalDays;
  return Math.min(100, Math.max(0, projected));
}

function buildRegionActions(
  region: 'HKMC' | 'TW',
  salesYoy: number | null,
  seasonSellthrough: number | null,
  projectedSeasonEndSellthrough: number | null,
  oldStock: number | null,
  invDays: number | null,
  stagnantRatio: number | null,
  stagnantRatioChange: number | null,
  seasonWindow: SeasonWindow | null,
  language: InsightLanguage
): [string, string] {
  const seasonEndLabel = seasonWindow?.endLabel ?? 'N/A';
  const isEarlySeason = seasonWindow !== null && seasonWindow.elapsedDays <= 14;
  const projectedRisk = projectedSeasonEndSellthrough !== null && projectedSeasonEndSellthrough < 70;
  const action1 =
    language === 'ko' && isEarlySeason && seasonSellthrough !== null
      ? `${region} 시즌 초기(${seasonWindow?.startLabel}~) 구간으로 현재 당시즌 판매율 ${fmtRate(seasonSellthrough)}은 추세 확인 단계임. 하위 카테고리 3개를 지정해 2주 테스트 할인/재배치를 실행하고 주차별 반응을 점검.`
      : language === 'en' && isEarlySeason && seasonSellthrough !== null
        ? `${region} is in the early season window (${seasonWindow?.startLabel}~); current in-season sell-through ${fmtRate(seasonSellthrough)} is still in trend-validation stage. Select 3 underperforming categories, run a 2-week test markdown/reallocation, and track weekly response.`
        : language === 'ko' && projectedRisk
          ? `${region} 시즌마감일(${seasonEndLabel}) 기준 예상 당시즌 판매율 ${fmtRate(projectedSeasonEndSellthrough)}로 소진 부담이 높음. 하위 카테고리 3개를 지정해 2주 할인/재배치를 실행하고 월말까지 실행 성과를 점검.`
          : language === 'en' && projectedRisk
            ? `By season close (${seasonEndLabel}), projected ${region} in-season sell-through is ${fmtRate(projectedSeasonEndSellthrough)}, indicating elevated clearance pressure. Select 3 underperforming categories, execute 2-week markdown/reallocation, and review outcomes by month-end.`
        : seasonSellthrough === null
          ? language === 'ko'
        ? `${region} 당시즌 판매율 데이터 점검이 필요함. 데이터 공백 SKU를 이번 주 내 보정하고 월말까지 실행 성과를 점검.`
            : `${region} in-season sell-through data needs validation. Correct missing-SKU data this week and review execution outcomes by month-end.`
        : projectedSeasonEndSellthrough !== null
          ? language === 'ko'
          ? `${region} 시즌마감일(${seasonEndLabel}) 기준 예상 당시즌 판매율 ${fmtRate(projectedSeasonEndSellthrough)}로 소진 흐름이 유지됨. 상위 전략 기반 주간 베스트 SKU를 확대하고 월말까지 실행 성과를 점검.`
            : `By season close (${seasonEndLabel}), projected ${region} in-season sell-through is ${fmtRate(projectedSeasonEndSellthrough)}, and depletion momentum is holding. Expand weekly best SKUs based on top strategies and review outcomes by month-end.`
          : language === 'ko'
            ? `${region} 당시즌 판매율 ${fmtRate(seasonSellthrough)}로 소진 흐름이 유지됨. 상위 전략 기반 주간 베스트 SKU를 확대하고 월말까지 실행 성과를 점검.`
            : `${region} in-season sell-through is ${fmtRate(seasonSellthrough)}, and depletion momentum is holding. Expand weekly best SKUs based on top strategies and review execution outcomes by month-end.`;

  const invThreshold =
    invDays === null
      ? null
      : invDays >= 300
        ? language === 'ko'
          ? '300일 이상(초장기 재고)'
          : '300+ days (ultra long-term)'
        : invDays >= 180
          ? language === 'ko'
            ? '180~299일(장기재고)'
            : '180-299 days (long-term)'
          : language === 'ko'
            ? '180일 미만(일반)'
            : 'under 180 days (normal)';
  const invMeaning =
    invDays === null
      ? ''
      : language === 'ko'
        ? ` 재고일수 ${fmtDaysByLang(invDays, language)}로, 주 판매기간(180일) 기준 약 ${fmtSellWindowTurns(invDays)} 소요되는 수준(${invThreshold}).`
        : ` Inventory days are ${fmtDaysByLang(invDays, language)}, implying about ${fmtSellWindowTurns(invDays)} sell-through windows (assuming a 180-day primary selling period, ${invThreshold}).`;
  const oldPart =
    oldStock === null
      ? language === 'ko'
        ? `${region} 과시즌 데이터 정합성 점검이 필요함. 데이터 소스와 집계키를 이번 주 내 재검증.`
        : `${region} old-season data consistency needs validation. Re-verify data sources and aggregation keys within this week.`
      : stagnantRatio === null
        ? language === 'ko'
          ? `${region} 과시즌 재고 ${fmtNum(oldStock)} 수준임. 정체재고비중 산출 로직을 점검하고 2주 내 대상 SKU를 정리.`
          : `${region} old-season stock is ${fmtNum(oldStock)}. Verify stagnant-ratio calculation logic and organize target SKUs within 2 weeks.`
        : language === 'ko'
          ? `${region} 정체재고비중 ${fmtRate(stagnantRatio)} (${stagnantRatioChange !== null ? `전월말 대비 ${fmtPpDelta(stagnantRatioChange, language)}, ` : ''}과시즌 재고 ${fmtNum(oldStock)}) 수준임.${invMeaning} 2주 내 대상 SKU를 정리하고 주 1회 추적.`
          : `${region} stagnant stock ratio is ${fmtRate(stagnantRatio)} (${stagnantRatioChange !== null ? `vs last month-end ${fmtPpDelta(stagnantRatioChange, language)}, ` : ''}old-season stock ${fmtNum(oldStock)}).${invMeaning} Organize target SKUs within 2 weeks and track weekly.`;

  return [action1, oldPart];
}

function normalizeInput(raw: any): ExecutiveInsightInput {
  const normalizedMode = raw?.mode === 'YTD' ? 'YTD' : 'MTD';
  const normalizedLanguage: InsightLanguage = raw?.language === 'en' ? 'en' : 'ko';
  const asOfDate = String(raw?.asOfDate || raw?.asof_date || '').trim();
  const brand = String(raw?.brand || '').trim().toUpperCase();
  const region = String(raw?.region || 'ALL').trim().toUpperCase();

  const hkmcFromLegacy = raw?.hkmc ?? {
    salesMtdYoy: toNumber(raw?.section1?.hkmc_mtd_yoy),
    salesYtdYoy: toNumber(raw?.section1?.hkmc_ytd_yoy),
    seasonSellthrough: toNumber(raw?.section2?.hkmc_sellthrough),
    oldStock: toNumber(raw?.section3?.hkmc_curr_stock),
    invDays: toNumber(raw?.section3?.hkmc_inv_days),
    stagnantRatio: toNumber(raw?.section3?.hkmc_stagnant_ratio),
    stagnantRatioChange: toNumber(raw?.section3?.hkmc_stagnant_ratio_change),
  };

  const twFromLegacy = raw?.tw ?? {
    salesMtdYoy: toNumber(raw?.section1?.tw_mtd_yoy),
    salesYtdYoy: toNumber(raw?.section1?.tw_ytd_yoy),
    seasonSellthrough: toNumber(raw?.section2?.tw_sellthrough),
    oldStock: toNumber(raw?.section3?.tw_curr_stock),
    invDays: toNumber(raw?.section3?.tw_inv_days),
    stagnantRatio: toNumber(raw?.section3?.tw_stagnant_ratio),
    stagnantRatioChange: toNumber(raw?.section3?.tw_stagnant_ratio_change),
  };

  const hkmc: ExecutiveRegionInput = {
    salesMtdYoy: toNumber(hkmcFromLegacy?.salesMtdYoy),
    salesYtdYoy: toNumber(hkmcFromLegacy?.salesYtdYoy),
    seasonSellthrough: toNumber(hkmcFromLegacy?.seasonSellthrough),
    oldStock: toNumber(hkmcFromLegacy?.oldStock),
    invDays: toNumber(hkmcFromLegacy?.invDays),
    stagnantRatio: toNumber(hkmcFromLegacy?.stagnantRatio),
    stagnantRatioChange: toNumber(hkmcFromLegacy?.stagnantRatioChange),
  };

  const tw: ExecutiveRegionInput = {
    salesMtdYoy: toNumber(twFromLegacy?.salesMtdYoy),
    salesYtdYoy: toNumber(twFromLegacy?.salesYtdYoy),
    seasonSellthrough: toNumber(twFromLegacy?.seasonSellthrough),
    oldStock: toNumber(twFromLegacy?.oldStock),
    invDays: toNumber(twFromLegacy?.invDays),
    stagnantRatio: toNumber(twFromLegacy?.stagnantRatio),
    stagnantRatioChange: toNumber(twFromLegacy?.stagnantRatioChange),
  };

  return {
    region,
    brand,
    asOfDate,
    mode: normalizedMode,
    language: normalizedLanguage,
    isToday: typeof raw?.isToday === 'boolean' ? raw.isToday : undefined,
    hkmc,
    tw,
  };
}

function toneByDiff(diff: number | null): InsightTone {
  if (diff === null) return 'neutral';
  if (diff >= 20) return 'positive';
  if (diff >= 5) return 'neutral';
  if (diff >= -10) return 'warning';
  return 'critical';
}

function toneByLevel(v: number | null, good: number, warn: number): InsightTone {
  if (v === null) return 'neutral';
  if (v >= good) return 'positive';
  if (v >= warn) return 'warning';
  return 'critical';
}

function buildSignals(input: ExecutiveInsightInput, language: InsightLanguage = 'ko') {
  const seasonWindow = resolveSeasonWindow(input.asOfDate);
  const salesHkmc = (input.mode === 'YTD' ? input.hkmc.salesYtdYoy : input.hkmc.salesMtdYoy) ?? null;
  const salesTw = (input.mode === 'YTD' ? input.tw.salesYtdYoy : input.tw.salesMtdYoy) ?? null;
  const salesYtdHkmc = input.hkmc.salesYtdYoy ?? null;
  const salesYtdTw = input.tw.salesYtdYoy ?? null;
  const seasonHkmc = input.hkmc.seasonSellthrough ?? null;
  const seasonTw = input.tw.seasonSellthrough ?? null;
  const stagnantRatioHkmc = input.hkmc.stagnantRatio ?? null;
  const stagnantRatioTw = input.tw.stagnantRatio ?? null;
  const stagnantRatioChangeHkmc = input.hkmc.stagnantRatioChange ?? null;
  const stagnantRatioChangeTw = input.tw.stagnantRatioChange ?? null;
  const seasonHkmcProjectedEom = projectSeasonEndSellthrough(seasonHkmc, seasonWindow);
  const seasonTwProjectedEom = projectSeasonEndSellthrough(seasonTw, seasonWindow);
  const oldHkmc = input.hkmc.oldStock ?? null;
  const oldTw = input.tw.oldStock ?? null;
  const invHkmc = input.hkmc.invDays ?? null;
  const invTw = input.tw.invDays ?? null;

  const salesDiff = salesHkmc !== null && salesTw !== null ? salesHkmc - salesTw : null;
  const seasonDiff = seasonHkmc !== null && seasonTw !== null ? seasonHkmc - seasonTw : null;

  const blocks: ExecutiveInsightBlock[] = [
    {
      id: 'sales',
      label: language === 'ko' ? '매출' : 'Sales',
      tone: toneByDiff(salesDiff),
      text:
        language === 'ko'
          ? `실판매출 YoY: HKMC ${fmtYoy(salesHkmc)}, TW ${fmtYoy(salesTw)}. 누적 YoY: HKMC ${fmtYoy(salesYtdHkmc)}, TW ${fmtYoy(salesYtdTw)}.`
          : `Actual sales YoY: HKMC ${fmtYoy(salesHkmc)}, TW ${fmtYoy(salesTw)}. YTD YoY: HKMC ${fmtYoy(salesYtdHkmc)}, TW ${fmtYoy(salesYtdTw)}.`,
    },
    {
      id: 'season',
      label: language === 'ko' ? '당시즌' : 'In-season',
      tone: toneByDiff(seasonDiff),
      text:
        language === 'ko'
          ? `당시즌 판매율은 HKMC ${fmtRate(seasonHkmc)}, TW ${fmtRate(seasonTw)}입니다.`
          : `In-season sell-through is HKMC ${fmtRate(seasonHkmc)}, TW ${fmtRate(seasonTw)}.`,
    },
    {
      id: 'old',
      label: language === 'ko' ? '과시즌' : 'Old-season',
      tone: toneByLevel(Math.max(invHkmc ?? 0, invTw ?? 0), 180, 120),
      text:
        language === 'ko'
          ? `과시즌 잔액/재고일수는 HKMC ${formatOldPairByLang(oldHkmc, invHkmc, language)}, TW ${formatOldPairByLang(oldTw, invTw, language)}입니다.`
          : `Old-season stock/inventory days are HKMC ${formatOldPairByLang(oldHkmc, invHkmc, language)}, TW ${formatOldPairByLang(oldTw, invTw, language)}.`,
    },
  ];

  const summaryLine = clampText(
    blocks
      .map((b) => `${b.label} ${b.text}`)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
    80
  );
  const compareLine = '';

  const [hkmcAction1, hkmcAction2] = buildRegionActions(
    'HKMC',
    salesHkmc,
    seasonHkmc,
    seasonHkmcProjectedEom,
    oldHkmc,
    invHkmc,
    stagnantRatioHkmc,
    stagnantRatioChangeHkmc,
    seasonWindow,
    language
  );
  const [twAction1, twAction2] = buildRegionActions(
    'TW',
    salesTw,
    seasonTw,
    seasonTwProjectedEom,
    oldTw,
    invTw,
    stagnantRatioTw,
    stagnantRatioChangeTw,
    seasonWindow,
    language
  );

  const actions = [
    { priority: 'HKMC-1' as const, text: hkmcAction1 },
    { priority: 'HKMC-2' as const, text: hkmcAction2 },
    { priority: 'TW-1' as const, text: twAction1 },
    { priority: 'TW-2' as const, text: twAction2 },
  ];

  return {
    summaryLine,
    compareLine,
    blocks,
    actions,
    seasonEndDate: seasonWindow ? toIsoDate(seasonWindow.end) : '',
    seasonHkmcProjectedEom,
    seasonTwProjectedEom,
  };
}

function forceSalesBlockWithYtd(blocks: ExecutiveInsightBlock[], input: ExecutiveInsightInput): ExecutiveInsightBlock[] {
  const salesHkmc = (input.mode === 'YTD' ? input.hkmc.salesYtdYoy : input.hkmc.salesMtdYoy) ?? null;
  const salesTw = (input.mode === 'YTD' ? input.tw.salesYtdYoy : input.tw.salesMtdYoy) ?? null;
  const salesYtdHkmc = input.hkmc.salesYtdYoy ?? null;
  const salesYtdTw = input.tw.salesYtdYoy ?? null;

  return blocks.map((b) => {
    if (b.id !== 'sales') return b;
    return {
      ...b,
      text: `실판매출 YoY: HKMC ${fmtYoy(salesHkmc)}, TW ${fmtYoy(salesTw)}. 누적 YoY: HKMC ${fmtYoy(salesYtdHkmc)}, TW ${fmtYoy(salesYtdTw)}.`,
    };
  });
}

function forceSeasonBlock(blocks: ExecutiveInsightBlock[], input: ExecutiveInsightInput): ExecutiveInsightBlock[] {
  const seasonHkmc = input.hkmc.seasonSellthrough ?? null;
  const seasonTw = input.tw.seasonSellthrough ?? null;
  return blocks.map((b) => {
    if (b.id !== 'season') return b;
    return {
      ...b,
      text: `당시즌 판매율은 HKMC ${fmtRate(seasonHkmc)}, TW ${fmtRate(seasonTw)}입니다.`,
    };
  });
}

function forceOldBlock(blocks: ExecutiveInsightBlock[], input: ExecutiveInsightInput): ExecutiveInsightBlock[] {
  const oldHkmc = input.hkmc.oldStock ?? null;
  const oldTw = input.tw.oldStock ?? null;
  const invHkmc = input.hkmc.invDays ?? null;
  const invTw = input.tw.invDays ?? null;
  return blocks.map((b) => {
    if (b.id !== 'old') return b;
    return {
      ...b,
      text: `과시즌 잔액/재고일수는 HKMC ${formatOldPair(oldHkmc, invHkmc)}, TW ${formatOldPair(oldTw, invTw)}입니다.`,
    };
  });
}

function isValidTone(v: unknown): v is InsightTone {
  return v === 'positive' || v === 'neutral' || v === 'warning' || v === 'critical';
}

function validateResponseShape(obj: any): obj is Omit<ExecutiveInsightResponse, 'meta'> {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.title !== 'Executive Insight') return false;
  if (typeof obj.asOfLabel !== 'string' || typeof obj.summaryLine !== 'string' || typeof obj.compareLine !== 'string') return false;
  if (!Array.isArray(obj.blocks) || obj.blocks.length !== 3) return false;
  if (!Array.isArray(obj.actions) || obj.actions.length !== 4) return false;

  const expectedIds = ['sales', 'season', 'old'];
  for (let i = 0; i < 3; i += 1) {
    const b = obj.blocks[i];
    if (!b || b.id !== expectedIds[i] || typeof b.label !== 'string' || typeof b.text !== 'string' || !isValidTone(b.tone)) {
      return false;
    }
  }
  const expectedPriorities = ['HKMC-1', 'HKMC-2', 'TW-1', 'TW-2'];
  for (let i = 0; i < obj.actions.length; i += 1) {
    const a = obj.actions[i];
    if (!a || a.priority !== expectedPriorities[i] || typeof a.text !== 'string') {
      return false;
    }
  }
  return true;
}

function sanitizeInsightText(text: string): string {
  if (!text) return '';
  return text
    .replace(/실행안 확정/g, '우선 대응')
    .replace(/실행안을 확정/g, '우선 대응안을 정리')
    .replace(/HKMC\s*우위\s*유지\s*속/gi, 'HKMC/TW 각 특성 속')
    .replace(/HKMC\s*우위/gi, 'HKMC/TW 특성')
    .replace(/로 비교됩니다\./g, '입니다.')
    .replace(/비교됩니다\./g, '입니다.')
    .replace(/(?:HKMC|TW)\s*실판매출\s*YoY[^.]*기준으로 우선순위를 운영함\.?\s*/g, '')
    .replace(/실판매출\s*YoY[^.]*기준으로 우선순위를 운영함\.?\s*/g, '')
    .replace(/N\/A[\/·]N\/A일?/g, '데이터 없음')
    .trim();
}

function withMeta(
  payload: Omit<ExecutiveInsightResponse, 'meta'>,
  meta: { cached: boolean; generatedAt: string; ttlSeconds: number; model: string },
  input: ExecutiveInsightInput
): ExecutiveInsightResponse {
  const language: InsightLanguage = input.language === 'en' ? 'en' : 'ko';
  const localized = buildSignals(input, language);
  if (language === 'en') {
    return {
      ...payload,
      summaryLine: localized.summaryLine,
      compareLine: localized.compareLine,
      blocks: localized.blocks,
      actions: localized.actions,
      meta: {
        model: meta.model,
        cached: meta.cached,
        generatedAt: meta.generatedAt,
        ttlSeconds: meta.ttlSeconds,
      },
    };
  }

  const salesForced = forceSalesBlockWithYtd(payload.blocks, input);
  const seasonForced = forceSeasonBlock(salesForced, input);
  const oldForced = forceOldBlock(seasonForced, input);
  return {
    ...payload,
    summaryLine: clampText(sanitizeInsightText(payload.summaryLine), 80),
    compareLine: '',
    blocks: oldForced.map((b) => ({ ...b, text: sanitizeInsightText(b.text) })),
    // Always bind action text to current numeric inputs (no stale/hallucinated constants).
    actions: localized.actions.map((a) => ({ ...a, text: sanitizeInsightText(a.text) })),
    meta: {
      model: meta.model,
      cached: meta.cached,
      generatedAt: meta.generatedAt,
      ttlSeconds: meta.ttlSeconds,
    },
  };
}

async function generateExecutiveInsight(input: ExecutiveInsightInput): Promise<Omit<ExecutiveInsightResponse, 'meta'>> {
  const language: InsightLanguage = input.language === 'en' ? 'en' : 'ko';
  const signals = buildSignals(input, language);
  const asOfLabel = `${input.asOfDate} | ${input.brand} | ${input.mode || 'MTD'}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 800,
    messages: [
      { role: 'system', content: EXEC_INSIGHT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${EXEC_INSIGHT_USER_PROMPT}

INPUT:
${JSON.stringify(input, null, 2)}

SIGNALS:
${JSON.stringify(signals, null, 2)}

Output JSON only.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() || '{}';
  const parsed = JSON.parse(raw);
  if (!validateResponseShape(parsed)) {
    throw new Error('Invalid JSON schema from model');
  }

  return {
    ...parsed,
    title: 'Executive Insight',
    asOfLabel,
  };
}

function buildRuleFallback(input: ExecutiveInsightInput): Omit<ExecutiveInsightResponse, 'meta'> {
  const language: InsightLanguage = input.language === 'en' ? 'en' : 'ko';
  const signals = buildSignals(input, language);
  return {
    title: 'Executive Insight',
    asOfLabel: `${input.asOfDate} | ${input.brand} | ${input.mode || 'MTD'}`,
    summaryLine: signals.summaryLine,
    compareLine: signals.compareLine,
    blocks: signals.blocks,
    actions: signals.actions,
  };
}

function resolveTtlSeconds(input: ExecutiveInsightInput): number {
  if (typeof input.isToday === 'boolean') {
    return input.isToday ? 3600 : 12 * 3600;
  }
  const today = new Date().toISOString().slice(0, 10);
  return input.asOfDate === today ? 3600 : 12 * 3600;
}

function buildInputSignature(input: ExecutiveInsightInput): string {
  const f = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : 'na');
  return [
    f(input.hkmc.salesMtdYoy),
    f(input.hkmc.salesYtdYoy),
    f(input.hkmc.seasonSellthrough),
    f(input.hkmc.oldStock),
    f(input.hkmc.invDays),
    f(input.hkmc.stagnantRatio),
    f(input.hkmc.stagnantRatioChange),
    f(input.tw.salesMtdYoy),
    f(input.tw.salesYtdYoy),
    f(input.tw.seasonSellthrough),
    f(input.tw.oldStock),
    f(input.tw.invDays),
    f(input.tw.stagnantRatio),
    f(input.tw.stagnantRatioChange),
  ].join('_');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = normalizeInput(body);
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('forceRefresh') === 'true' || body?.skip_cache === true;

    if (!input.brand || !input.asOfDate) {
      return NextResponse.json({ error: 'brand and asOfDate are required' }, { status: 400 });
    }

    const regionPart = input.region && input.region !== 'ALL' ? input.region : 'ALL';
    const languagePart: InsightLanguage = input.language === 'en' ? 'en' : 'ko';
    const inputSignature = buildInputSignature(input);
    const cacheKey = buildKey([
      'insights',
      'exec',
      'v21',
      languagePart,
      regionPart,
      input.brand,
      input.asOfDate,
      input.mode || 'MTD',
      inputSignature,
    ]);
    const ttlSeconds = resolveTtlSeconds(input);

    const cached = forceRefresh ? null : await cacheGet<ExecutiveInsightResponse>(cacheKey);
    if (cached && !forceRefresh) {
      return NextResponse.json(
        withMeta(
          {
            title: 'Executive Insight',
            asOfLabel: cached.asOfLabel,
            summaryLine: cached.summaryLine,
            compareLine: cached.compareLine,
            blocks: cached.blocks,
            actions: cached.actions,
          },
          {
            cached: true,
            generatedAt: cached.meta?.generatedAt || new Date().toISOString(),
            ttlSeconds: cached.meta?.ttlSeconds || ttlSeconds,
            model: cached.meta?.model || MODEL,
          },
          input
        )
      );
    }

    const generatedAt = new Date().toISOString();
    let payload: Omit<ExecutiveInsightResponse, 'meta'>;

    try {
      if (!EXEC_INSIGHT_USE_LLM || !process.env.OPENAI_API_KEY) {
        throw new Error('LLM path disabled');
      }
      payload = await generateExecutiveInsight(input);
    } catch {
      payload = buildRuleFallback(input);
    }

    const final = withMeta(payload, { cached: false, generatedAt, ttlSeconds, model: MODEL }, input);
    await cacheSet(cacheKey, final, ttlSeconds);
    return NextResponse.json(final);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate executive insight' }, { status: 500 });
  }
}
