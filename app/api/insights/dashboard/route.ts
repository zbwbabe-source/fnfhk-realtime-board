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

function formatOldPair(stock: number | null, days: number | null): string {
  if (stock === null && days === null) return '데이터 없음';
  if (stock === null || days === null) return '데이터 일부 없음';
  return `${fmtNum(stock)}·${fmtDays(days)}`;
}

function normalizeInput(raw: any): ExecutiveInsightInput {
  const normalizedMode = raw?.mode === 'YTD' ? 'YTD' : 'MTD';
  const asOfDate = String(raw?.asOfDate || raw?.asof_date || '').trim();
  const brand = String(raw?.brand || '').trim().toUpperCase();
  const region = String(raw?.region || 'ALL').trim().toUpperCase();

  const hkmcFromLegacy = raw?.hkmc ?? {
    salesMtdYoy: toNumber(raw?.section1?.hkmc_mtd_yoy),
    salesYtdYoy: toNumber(raw?.section1?.hkmc_ytd_yoy),
    seasonSellthrough: toNumber(raw?.section2?.hkmc_sellthrough),
    oldStock: toNumber(raw?.section3?.hkmc_curr_stock),
    invDays: toNumber(raw?.section3?.hkmc_inv_days),
  };

  const twFromLegacy = raw?.tw ?? {
    salesMtdYoy: toNumber(raw?.section1?.tw_mtd_yoy),
    salesYtdYoy: toNumber(raw?.section1?.tw_ytd_yoy),
    seasonSellthrough: toNumber(raw?.section2?.tw_sellthrough),
    oldStock: toNumber(raw?.section3?.tw_curr_stock),
    invDays: toNumber(raw?.section3?.tw_inv_days),
  };

  const hkmc: ExecutiveRegionInput = {
    salesMtdYoy: toNumber(hkmcFromLegacy?.salesMtdYoy),
    salesYtdYoy: toNumber(hkmcFromLegacy?.salesYtdYoy),
    seasonSellthrough: toNumber(hkmcFromLegacy?.seasonSellthrough),
    oldStock: toNumber(hkmcFromLegacy?.oldStock),
    invDays: toNumber(hkmcFromLegacy?.invDays),
  };

  const tw: ExecutiveRegionInput = {
    salesMtdYoy: toNumber(twFromLegacy?.salesMtdYoy),
    salesYtdYoy: toNumber(twFromLegacy?.salesYtdYoy),
    seasonSellthrough: toNumber(twFromLegacy?.seasonSellthrough),
    oldStock: toNumber(twFromLegacy?.oldStock),
    invDays: toNumber(twFromLegacy?.invDays),
  };

  return {
    region,
    brand,
    asOfDate,
    mode: normalizedMode,
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

function buildSignals(input: ExecutiveInsightInput) {
  const salesHkmc = (input.mode === 'YTD' ? input.hkmc.salesYtdYoy : input.hkmc.salesMtdYoy) ?? null;
  const salesTw = (input.mode === 'YTD' ? input.tw.salesYtdYoy : input.tw.salesMtdYoy) ?? null;
  const salesYtdHkmc = input.hkmc.salesYtdYoy ?? null;
  const salesYtdTw = input.tw.salesYtdYoy ?? null;
  const seasonHkmc = input.hkmc.seasonSellthrough ?? null;
  const seasonTw = input.tw.seasonSellthrough ?? null;
  const oldHkmc = input.hkmc.oldStock ?? null;
  const oldTw = input.tw.oldStock ?? null;
  const invHkmc = input.hkmc.invDays ?? null;
  const invTw = input.tw.invDays ?? null;

  const salesDiff = salesHkmc !== null && salesTw !== null ? salesHkmc - salesTw : null;
  const seasonDiff = seasonHkmc !== null && seasonTw !== null ? seasonHkmc - seasonTw : null;

  const blocks: ExecutiveInsightBlock[] = [
    {
      id: 'sales',
      label: '매출',
      tone: toneByDiff(salesDiff),
      text: `실판매출 YoY: HKMC ${fmtYoy(salesHkmc)}, TW ${fmtYoy(salesTw)}. 누적 YoY: HKMC ${fmtYoy(salesYtdHkmc)}, TW ${fmtYoy(salesYtdTw)}.`,
    },
    {
      id: 'season',
      label: '당시즌',
      tone: toneByDiff(seasonDiff),
      text: `당시즌 판매율은 HKMC ${fmtRate(seasonHkmc)}, TW ${fmtRate(seasonTw)}입니다.`,
    },
    {
      id: 'old',
      label: '과시즌',
      tone: toneByLevel(Math.max(invHkmc ?? 0, invTw ?? 0), 180, 120),
      text: `과시즌 잔액/재고일수는 HKMC ${formatOldPair(oldHkmc, invHkmc)}, TW ${formatOldPair(oldTw, invTw)}입니다.`,
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

  const actions = [
    { priority: 'P1' as const, text: 'TW 당시즌 소진 둔화 → 차기 과시즌 부담 전이 가능, 선제 소진 대책을 즉시 점검.' },
    { priority: 'P2' as const, text: 'HKMC/TW 매출 YoY 차이는 채널·상품군 구성 차이 여부를 우선 점검.' },
    { priority: 'P3' as const, text: '과시즌 재고일수 상위 구간 중심으로 할인·재배치 우선순위를 재설정.' },
  ];

  return {
    summaryLine,
    compareLine,
    blocks,
    actions,
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
  if (!Array.isArray(obj.actions) || obj.actions.length > 3) return false;

  const expectedIds = ['sales', 'season', 'old'];
  for (let i = 0; i < 3; i += 1) {
    const b = obj.blocks[i];
    if (!b || b.id !== expectedIds[i] || typeof b.label !== 'string' || typeof b.text !== 'string' || !isValidTone(b.tone)) {
      return false;
    }
  }
  for (let i = 0; i < obj.actions.length; i += 1) {
    const a = obj.actions[i];
    if (!a || (a.priority !== 'P1' && a.priority !== 'P2' && a.priority !== 'P3') || typeof a.text !== 'string') {
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
    .replace(/N\/A[\/·]N\/A일?/g, '데이터 없음')
    .trim();
}

function withMeta(
  payload: Omit<ExecutiveInsightResponse, 'meta'>,
  meta: { cached: boolean; generatedAt: string; ttlSeconds: number; model: string },
  input: ExecutiveInsightInput
): ExecutiveInsightResponse {
  const salesForced = forceSalesBlockWithYtd(payload.blocks, input);
  const seasonForced = forceSeasonBlock(salesForced, input);
  const oldForced = forceOldBlock(seasonForced, input);
  return {
    ...payload,
    summaryLine: clampText(sanitizeInsightText(payload.summaryLine), 80),
    compareLine: '',
    blocks: oldForced.map((b) => ({ ...b, text: sanitizeInsightText(b.text) })),
    actions: payload.actions.map((a) => ({ ...a, text: sanitizeInsightText(a.text) })),
    meta: {
      model: meta.model,
      cached: meta.cached,
      generatedAt: meta.generatedAt,
      ttlSeconds: meta.ttlSeconds,
    },
  };
}

async function generateExecutiveInsight(input: ExecutiveInsightInput): Promise<Omit<ExecutiveInsightResponse, 'meta'>> {
  const signals = buildSignals(input);
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
  const signals = buildSignals(input);
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
    const cacheKey = buildKey(['insights', 'exec', 'v9', regionPart, input.brand, input.asOfDate, input.mode || 'MTD']);
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
