import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildKey, cacheGet, cacheSet } from '@/lib/cache';
import type {
  ExecutiveInsightAction,
  ExecutiveInsightBlock,
  ExecutiveInsightInput,
  ExecutiveInsightResponse,
  ExecutiveRegionInput,
  InsightTone,
} from '@/lib/insights/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'rule-based-v2';
type InsightLanguage = 'ko' | 'en';
const REWRITE_MODEL = 'gpt-4o-mini';
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function normalizeStrategyText(text: string): string {
  return text
    .replace(/갩/g, '갭')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function rewriteActionsWithOpenAI(
  language: InsightLanguage,
  brand: string,
  asOfDate: string,
  mode: 'MTD' | 'YTD',
  actions: ExecutiveInsightAction[]
): Promise<ExecutiveInsightAction[]> {
  if (!openaiClient || actions.length === 0) return actions;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const prompt =
      language === 'ko'
        ? `다음 전략 문구를 자연스럽고 임원 보고용으로 다듬어 주세요.
- 숫자, 기간, 방향(증가/감소), 구분([매장]/[당시즌]/[과시즌]), 지역(HKMC/TW)은 절대 변경 금지
- 형식 "현황/대상/실행/수치목표/기간/리스크"는 유지
- 의미는 유지하고 문장만 매끄럽게 개선

메타: brand=${brand}, asOfDate=${asOfDate}, mode=${mode}
입력 actions(JSON):
${JSON.stringify(actions)}`
        : `Polish the following strategy lines for executive readability.
- Do not change numbers, periods, direction, region labels, or section tags
- Keep the structure "Status/Target/Action/Numeric goal/Period/Risk"
- Keep meaning identical; improve wording only

Meta: brand=${brand}, asOfDate=${asOfDate}, mode=${mode}
Input actions(JSON):
${JSON.stringify(actions)}`;

    const resp = await openaiClient.chat.completions.create(
      {
        model: REWRITE_MODEL,
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return strict JSON only: {"actions":[{"priority":"HKMC|TW","text":"..."}]}. Keep array length/order and priorities unchanged.',
          },
          { role: 'user', content: prompt },
        ],
      },
      { signal: controller.signal as any }
    );

    const raw = resp.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);
    const candidate = Array.isArray(parsed?.actions) ? parsed.actions : [];
    if (candidate.length !== actions.length) return actions;

    return candidate.map((item: any, idx: number) => {
      const base = actions[idx];
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      const priority = item?.priority === 'TW' ? 'TW' : 'HKMC';
      if (!text || priority !== base.priority) return base;
      return { priority: base.priority, text: normalizeStrategyText(text) };
    });
  } catch {
    return actions;
  } finally {
    clearTimeout(timeout);
  }
}

function toNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fmtPercent(v: number | null, digits = 0): string {
  if (v === null) return 'N/A';
  return `${v.toFixed(digits)}%`;
}

function fmtPp(v: number | null, language: InsightLanguage): string {
  if (v === null) return 'N/A';
  const sign = v > 0 ? '+' : '';
  return language === 'ko' ? `${sign}${v.toFixed(1)}%p` : `${sign}${v.toFixed(1)}pp`;
}
function fmtDiscountPpKo(v: number | null): string {
  if (v === null) return 'N/A';
  if (v > 0) return `+${v.toFixed(1)}%p`;
  if (v < 0) return `\u25B3${Math.abs(v).toFixed(1)}%p`;
  return '0.0%p';
}

function fmtNum(v: number | null): string {
  if (v === null) return 'N/A';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function toneByDelta(v: number | null): InsightTone {
  if (v === null) return 'neutral';
  if (v >= 0) return 'positive';
  if (v > -5) return 'warning';
  return 'critical';
}

function normalizeInput(raw: any): ExecutiveInsightInput {
  const normalizedMode = raw?.mode === 'YTD' ? 'YTD' : 'MTD';
  const normalizedLanguage: InsightLanguage = raw?.language === 'en' ? 'en' : 'ko';
  const asOfDate = String(raw?.asOfDate || raw?.asof_date || '').trim();
  const brand = String(raw?.brand || '').trim().toUpperCase();
  const region = String(raw?.region || 'ALL').trim().toUpperCase();

  const hkmcRaw = raw?.hkmc || {};
  const twRaw = raw?.tw || {};

  const hkmc: ExecutiveRegionInput = {
    salesMtdYoy: toNumber(hkmcRaw.salesMtdYoy),
    salesYtdYoy: toNumber(hkmcRaw.salesYtdYoy),
    sameStoreMtdYoy: toNumber(hkmcRaw.sameStoreMtdYoy),
    sameStoreYtdYoy: toNumber(hkmcRaw.sameStoreYtdYoy),
    seasonSellthrough: toNumber(hkmcRaw.seasonSellthrough),
    seasonSellthroughYoyPp: toNumber(hkmcRaw.seasonSellthroughYoyPp),
    seasonTopCategories: Array.isArray(hkmcRaw.seasonTopCategories)
      ? hkmcRaw.seasonTopCategories
          .map((v: unknown) => String(v ?? '').trim())
          .filter((v: string) => !!v)
          .slice(0, 3)
      : [],
    discountRateMtd: toNumber(hkmcRaw.discountRateMtd),
    discountRateYtd: toNumber(hkmcRaw.discountRateYtd),
    discountRateMtdDiff: toNumber(hkmcRaw.discountRateMtdDiff),
    discountRateYtdDiff: toNumber(hkmcRaw.discountRateYtdDiff),
    oldStock: toNumber(hkmcRaw.oldStock),
    oldStockYoy: toNumber(hkmcRaw.oldStockYoy),
    invDays: toNumber(hkmcRaw.invDays),
    oldStock2yPlusShare: toNumber(hkmcRaw.oldStock2yPlusShare),
    oldStock3yPlusShare: toNumber(hkmcRaw.oldStock3yPlusShare),
    stagnantRatio: toNumber(hkmcRaw.stagnantRatio),
    stagnantRatioChange: toNumber(hkmcRaw.stagnantRatioChange),
  };

  const tw: ExecutiveRegionInput = {
    salesMtdYoy: toNumber(twRaw.salesMtdYoy),
    salesYtdYoy: toNumber(twRaw.salesYtdYoy),
    sameStoreMtdYoy: toNumber(twRaw.sameStoreMtdYoy),
    sameStoreYtdYoy: toNumber(twRaw.sameStoreYtdYoy),
    seasonSellthrough: toNumber(twRaw.seasonSellthrough),
    seasonSellthroughYoyPp: toNumber(twRaw.seasonSellthroughYoyPp),
    seasonTopCategories: Array.isArray(twRaw.seasonTopCategories)
      ? twRaw.seasonTopCategories
          .map((v: unknown) => String(v ?? '').trim())
          .filter((v: string) => !!v)
          .slice(0, 3)
      : [],
    discountRateMtd: toNumber(twRaw.discountRateMtd),
    discountRateYtd: toNumber(twRaw.discountRateYtd),
    discountRateMtdDiff: toNumber(twRaw.discountRateMtdDiff),
    discountRateYtdDiff: toNumber(twRaw.discountRateYtdDiff),
    oldStock: toNumber(twRaw.oldStock),
    oldStockYoy: toNumber(twRaw.oldStockYoy),
    invDays: toNumber(twRaw.invDays),
    oldStock2yPlusShare: toNumber(twRaw.oldStock2yPlusShare),
    oldStock3yPlusShare: toNumber(twRaw.oldStock3yPlusShare),
    stagnantRatio: toNumber(twRaw.stagnantRatio),
    stagnantRatioChange: toNumber(twRaw.stagnantRatioChange),
  };

  const riskRuleTextKo = (discountDiff: number | null, oldYoy: number | null) => {
    const discountRisk =
      discountDiff !== null && discountDiff >= 1.5
        ? '\uD560\uC778\uC728 +1.5%p \uC774\uC0C1+\uD310\uB9E4 YoY<100 \uC2DC \uD560\uC778\uC815\uCC45 \uC911\uB2E8 \uD6C4 \uC804\uD658'
        : '\uD560\uC778\uC728 \uC99D\uAC10 \uC8FC\uAC04 \uBAA8\uB2C8\uD130\uB9C1';
    const stockRisk =
      oldYoy !== null && oldYoy > 120
        ? '\uACFC\uC2DC\uC98C \uC794\uC561 YoY 120% \uCD08\uACFC \uC2DC \uC989\uC2DC \uC7AC\uACE0\uC18C\uC9C4 \uC561\uC158 \uC6B0\uC120 \uC804\uD658'
        : '\uACFC\uC2DC\uC98C \uC794\uC561 YoY 120% \uC784\uACC4\uAC12 \uAC10\uC2DC';
    return `${discountRisk}; ${stockRisk}`;
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

async function buildInsight(input: ExecutiveInsightInput): Promise<Omit<ExecutiveInsightResponse, 'meta'>> {
  const language: InsightLanguage = input.language === 'en' ? 'en' : 'ko';
  const mode = input.mode || 'MTD';

  const salesHkmc = mode === 'YTD' ? input.hkmc.salesYtdYoy ?? null : input.hkmc.salesMtdYoy ?? null;
  const salesTw = mode === 'YTD' ? input.tw.salesYtdYoy ?? null : input.tw.salesMtdYoy ?? null;
  const sameHkmc = mode === 'YTD' ? input.hkmc.sameStoreYtdYoy ?? null : input.hkmc.sameStoreMtdYoy ?? null;
  const sameTw = mode === 'YTD' ? input.tw.sameStoreYtdYoy ?? null : input.tw.sameStoreMtdYoy ?? null;

  const salesYtdHkmc = input.hkmc.salesYtdYoy ?? null;
  const salesYtdTw = input.tw.salesYtdYoy ?? null;
  const sameYtdHkmc = input.hkmc.sameStoreYtdYoy ?? null;
  const sameYtdTw = input.tw.sameStoreYtdYoy ?? null;

  const seasonHkmc = input.hkmc.seasonSellthrough ?? null;
  const seasonTw = input.tw.seasonSellthrough ?? null;
  const seasonPpHkmc = input.hkmc.seasonSellthroughYoyPp ?? null;
  const seasonPpTw = input.tw.seasonSellthroughYoyPp ?? null;
  const seasonTopHkmc = (input.hkmc.seasonTopCategories || []).slice(0, 3);
  const seasonTopTw = (input.tw.seasonTopCategories || []).slice(0, 3);
  const seasonTopHkmcText = seasonTopHkmc.length > 0 ? seasonTopHkmc.join(' ') : 'N/A';
  const seasonTopTwText = seasonTopTw.length > 0 ? seasonTopTw.join(' ') : 'N/A';

  const oldStockHkmc = input.hkmc.oldStock ?? null;
  const oldStockTw = input.tw.oldStock ?? null;
  const oldStockYoyHkmc = input.hkmc.oldStockYoy ?? null;
  const oldStockYoyTw = input.tw.oldStockYoy ?? null;
  const oldInvDaysHkmc = input.hkmc.invDays ?? null;
  const oldInvDaysTw = input.tw.invDays ?? null;
  const old2yShareHkmc = input.hkmc.oldStock2yPlusShare ?? null;
  const old2yShareTw = input.tw.oldStock2yPlusShare ?? null;
  const old3yShareHkmc = input.hkmc.oldStock3yPlusShare ?? null;
  const old3yShareTw = input.tw.oldStock3yPlusShare ?? null;
  const stagnantRatioHkmc = input.hkmc.stagnantRatio ?? null;
  const stagnantRatioTw = input.tw.stagnantRatio ?? null;
  const discountRateHkmc = input.hkmc.discountRateMtd ?? null;
  const discountRateTw = input.tw.discountRateMtd ?? null;
  const discountRateDiffHkmc = input.hkmc.discountRateMtdDiff ?? null;
  const discountRateDiffTw = input.tw.discountRateMtdDiff ?? null;
  const salesMtdHkmc = input.hkmc.salesMtdYoy ?? null;
  const salesMtdTw = input.tw.salesMtdYoy ?? null;
  const sameMtdHkmc = input.hkmc.sameStoreMtdYoy ?? null;
  const sameMtdTw = input.tw.sameStoreMtdYoy ?? null;
  const salesTextKo =
    `\uB2F9\uC6D4 \uC804\uCCB4 HKMC ${fmtPercent(salesMtdHkmc)},TW ${fmtPercent(salesMtdTw)}\n` +
    `\uB2F9\uC6D4 \uB3D9\uB9E4\uC7A5 HKMC ${fmtPercent(sameMtdHkmc)},TW ${fmtPercent(sameMtdTw)}\n` +
    `\uB204\uC801 \uC804\uCCB4 HKMC ${fmtPercent(salesYtdHkmc)},TW ${fmtPercent(salesYtdTw)}\n` +
    `\uB204\uC801 \uB3D9\uB9E4\uC7A5 HKMC ${fmtPercent(sameYtdHkmc)},TW ${fmtPercent(sameYtdTw)}`;
  const salesTextEn =
    `MTD HKMC${fmtPercent(salesMtdHkmc)},TW${fmtPercent(salesMtdTw)}|Same-store${fmtPercent(sameMtdHkmc)},${fmtPercent(sameMtdTw)}\n` +
    `YTD HKMC${fmtPercent(salesYtdHkmc)},TW${fmtPercent(salesYtdTw)}|Same-store${fmtPercent(sameYtdHkmc)},${fmtPercent(sameYtdTw)}`;
  const oldTextKo =
    `\uC794\uC561 : HKMC ${fmtPercent(oldStockYoyHkmc, 0)} (${fmtNum(oldStockHkmc)}), TW ${fmtPercent(oldStockYoyTw, 0)} (${fmtNum(oldStockTw)}).\n` +
    `\uB2F9\uC6D4\uD310\uB9E4 : HKMC ${fmtPercent(salesMtdHkmc)}, TW ${fmtPercent(salesMtdTw)}\n` +
    `\uB204\uC801\uD310\uB9E4 : HKMC ${fmtPercent(salesYtdHkmc)}, TW ${fmtPercent(salesYtdTw)}\n` +
    `\uD560\uC778\uC728 : HKMC ${fmtPercent(discountRateHkmc, 1)} (${fmtDiscountPpKo(discountRateDiffHkmc)}), TW ${fmtPercent(discountRateTw, 1)} (${fmtDiscountPpKo(discountRateDiffTw)})`;
  const oldTextEn =
    `Balance: HKMC ${fmtPercent(oldStockYoyHkmc, 0)} (${fmtNum(oldStockHkmc)}), TW ${fmtPercent(oldStockYoyTw, 0)} (${fmtNum(oldStockTw)}).\n` +
    `MTD Sales: HKMC ${fmtPercent(salesMtdHkmc)}, TW ${fmtPercent(salesMtdTw)}\n` +
    `YTD Sales: HKMC ${fmtPercent(salesYtdHkmc)}, TW ${fmtPercent(salesYtdTw)}\n` +
    `MTD Discount: HKMC ${fmtPercent(discountRateHkmc, 1)} (${fmtPp(discountRateDiffHkmc, language)}), TW ${fmtPercent(discountRateTw, 1)} (${fmtPp(discountRateDiffTw, language)})`;

  const blocks: ExecutiveInsightBlock[] = [
    {
      id: 'sales',
      label: language === 'ko' ? '留ㅼ텧' : 'Sales',
      tone: toneByDelta((salesHkmc ?? 0) - (salesTw ?? 0)),
      text:
        language === 'ko'
          ? mode === 'YTD'
            ? `?꾩쟻 YoY HKMC ${fmtPercent(salesYtdHkmc)}, TW ${fmtPercent(salesYtdTw)} | ?꾩쟻 ?숇ℓ??HKMC ${fmtPercent(sameYtdHkmc)}, TW ${fmtPercent(sameYtdTw)}`
            : `?뱀썡 YoY HKMC ${fmtPercent(salesHkmc)}, TW ${fmtPercent(salesTw)} | ?숇ℓ??HKMC ${fmtPercent(sameHkmc)}, TW ${fmtPercent(sameTw)}`
          : mode === 'YTD'
            ? `YTD YoY HKMC ${fmtPercent(salesYtdHkmc)}, TW ${fmtPercent(salesYtdTw)} | YTD same-store HKMC ${fmtPercent(sameYtdHkmc)}, TW ${fmtPercent(sameYtdTw)}`
            : `MTD YoY HKMC ${fmtPercent(salesHkmc)}, TW ${fmtPercent(salesTw)} | Same-store HKMC ${fmtPercent(sameHkmc)}, TW ${fmtPercent(sameTw)}`,
    },
    {
      id: 'season',
      label: language === 'ko' ? '\uB2F9\uC2DC\uC98C \uD310\uB9E4\uC728' : 'In-season Sell-through',
      tone: toneByDelta((seasonPpHkmc ?? 0) - (seasonPpTw ?? 0)),
      text:
        language === 'ko'
          ? `HKMC ${fmtPercent(seasonHkmc, 1)} (${fmtPp(seasonPpHkmc, language)})\nTOP3: ${seasonTopHkmcText}\nTW ${fmtPercent(seasonTw, 1)} (${fmtPp(seasonPpTw, language)})\nTOP3: ${seasonTopTwText}`
          : `HKMC ${fmtPercent(seasonHkmc, 1)} (${fmtPp(seasonPpHkmc, language)})\nTOP3: ${seasonTopHkmcText}\nTW ${fmtPercent(seasonTw, 1)} (${fmtPp(seasonPpTw, language)})\nTOP3: ${seasonTopTwText}`,
    },
    {
      id: 'old',
      label: language === 'ko' ? '\uACFC\uC2DC\uC98C' : 'Old-season',
      tone: toneByDelta((oldStockYoyHkmc ?? 0) - (oldStockYoyTw ?? 0)),
      text:
        language === 'ko'
          ? `怨쇱떆利??붿븸 YoY: HKMC ${fmtPercent(oldStockYoyHkmc, 1)} (${fmtNum(oldStockHkmc)}), TW ${fmtPercent(oldStockYoyTw, 1)} (${fmtNum(oldStockTw)}).`
          : `Old-season balance YoY: HKMC ${fmtPercent(oldStockYoyHkmc, 1)} (${fmtNum(oldStockHkmc)}), TW ${fmtPercent(oldStockYoyTw, 1)} (${fmtNum(oldStockTw)}).`,
    },
  ];
  if (blocks[0]?.id === 'sales') {
    blocks[0].label = language === 'ko' ? '\uC2E4\uD310\uB9E4\uCD9C' : 'Sales';
    blocks[0].text = language === 'ko' ? salesTextKo : salesTextEn;
  }
  if (blocks[2]?.id === 'old') {
    blocks[2].text = language === 'ko' ? oldTextKo : oldTextEn;
  }

  const legacyActions =
    language === 'ko'
      ? [
          {
            priority: 'HKMC' as const,
            text: `HKMC??留ㅼ텧/?숇ℓ???먮ℓ??蹂?붽? ?숈떆??蹂댁씠??移댄뀒怨좊━ 以묒떖?쇰줈 二쇨컙 ?ㅽ뻾?덉쓣 1媛쒕줈 ?듯빀???댁쁺?섏꽭??`,
          },
          {
            priority: 'TW' as const,
            text: `TW???먮ℓ??利앷컧怨?怨쇱떆利??붿븸 YoY瑜??④퍡 蹂대㈃?? ??⑥쑉 移댄뀒怨좊━ 2二??≪뀡???곗꽑 ?ㅽ뻾?섏꽭??`,
          },
        ]
      : [
          {
            priority: 'HKMC' as const,
            text: `For HKMC, run one weekly plan focused on categories where sales, same-store YoY, and sell-through move together.`,
          },
          {
            priority: 'TW' as const,
            text: `For TW, prioritize a 2-week action on low-efficiency categories using sell-through delta and old-season balance YoY together.`,
          },
        ];

  const hkmcFocusCats = seasonTopHkmc.length > 0 ? seasonTopHkmc.slice(0, 2).join(', ') : 'TOP3 categories';
  const twFocusCats = seasonTopTw.length > 0 ? seasonTopTw.slice(0, 2).join(', ') : 'TOP3 categories';
  const hkmcTargetPp = seasonPpHkmc === null ? 1.5 : Math.max(1.0, Math.min(3.0, Math.abs(seasonPpHkmc) * 0.35));
  const twTargetPp = seasonPpTw === null ? 1.5 : Math.max(1.0, Math.min(3.0, Math.abs(seasonPpTw) * 0.35));
  const fmtKoDiff = (v: number | null) => {
    if (v === null) return 'N/A';
    if (v > 0) return `+${v.toFixed(1)}%p`;
    if (v < 0) return `\u25B3${Math.abs(v).toFixed(1)}%p`;
    return '0.0%p';
  };
  const fmtEnDiff = (v: number | null) => {
    if (v === null) return 'N/A';
    if (v > 0) return `+${v.toFixed(1)}pp`;
    if (v < 0) return `-${Math.abs(v).toFixed(1)}pp`;
    return '0.0pp';
  };

  const actions =
    language === 'ko'
      ? [
          {
            priority: 'HKMC' as const,
            text: `???${hkmcFocusCats} / ?ㅽ뻾 2二??좏깮?좎씤(??뚯쟾 SKU 以묒떖) / 紐⑺몴 ?먮ℓ??+${hkmcTargetPp.toFixed(1)}%p, ?숇ℓ??YoY ${fmtPercent(sameMtdHkmc)}??{fmtPercent((sameMtdHkmc ?? 100) + hkmcTargetPp)} / 湲곌컙 2二?/ 由ъ뒪???좎씤??利앷컧 ${fmtKoDiff(discountRateDiffHkmc)}媛 +?대㈃ 留덉쭊 ?쇱넀 ?꾪뿕.`,
          },
          {
            priority: 'TW' as const,
            text: `???${twFocusCats} / ?ㅽ뻾 怨쇱떆利??붿븸 YoY ${fmtPercent(oldStockYoyTw, 0)} 援ш컙 ?곗꽑 ?대━?대윴??/ 紐⑺몴 ?먮ℓ??+${twTargetPp.toFixed(1)}%p, ?꾩쟻?먮ℓ YoY ${fmtPercent(salesYtdTw)} ?좎? / 湲곌컙 2二?3??媛꾧꺽 ?먭?) / 由ъ뒪???좎씤??利앷컧 ${fmtKoDiff(discountRateDiffTw)}媛 +?대㈃ 媛앸떒媛 ?섎씫 ?꾪뿕.`,
          },
        ]
      : [
          {
            priority: 'HKMC' as const,
            text: `Target ${hkmcFocusCats} / Action selective markdown for 2 weeks (low-rotation SKUs) / Goal sell-through +${hkmcTargetPp.toFixed(1)}pp, same-store YoY ${fmtPercent(sameMtdHkmc)}??{fmtPercent((sameMtdHkmc ?? 100) + hkmcTargetPp)} / Window 2 weeks / Risk discount delta ${fmtEnDiff(discountRateDiffHkmc)} with plus side can damage margin.`,
          },
          {
            priority: 'TW' as const,
            text: `Target ${twFocusCats} / Action prioritize clearance on old-season balance YoY ${fmtPercent(oldStockYoyTw, 0)} segments / Goal sell-through +${twTargetPp.toFixed(1)}pp while holding YTD YoY ${fmtPercent(salesYtdTw)} / Window 2 weeks (every 3 days review) / Risk discount delta ${fmtEnDiff(discountRateDiffTw)} with plus side can hurt AUR.`,
          },
        ];

  const formatKoDelta = (v: number | null) => {
    if (v === null) return 'N/A';
    if (v > 0) return `+${v.toFixed(1)}%p`;
    if (v < 0) return `\u25B3${Math.abs(v).toFixed(1)}%p`;
    return '0.0%p';
  };
  const formatEnDelta = (v: number | null) => {
    if (v === null) return 'N/A';
    if (v > 0) return `+${v.toFixed(1)}pp`;
    if (v < 0) return `-${Math.abs(v).toFixed(1)}pp`;
    return '0.0pp';
  };
  const buildKoStoreDiagnosis = (discountDiff: number | null, sameYoy: number | null, totalYoy: number | null) => {
    const salesImproved = (sameYoy ?? 100) >= 100 || (totalYoy ?? 100) >= 100;
    const salesWeakened = (sameYoy ?? 100) < 100 && (totalYoy ?? 100) < 100;

    let prefix = '\uD560\uC778\uC728-\uD310\uB9E4 YoY \uC5F0\uACC4 \uD310\uC815 \uC790\uB8CC \uCD94\uAC00 \uD544\uC694';

    if (discountDiff !== null) {
      if (discountDiff < 0 && salesImproved) {
        prefix = '\uD560\uC778\uC728 YoY \uAC10\uC18C\uC5D0\uB3C4 \uD310\uB9E4 YoY \uAC1C\uC120 (\uAC00\uACA9 \uD6A8\uC728 \uC591\uD638)';
      } else if (discountDiff < 0 && salesWeakened) {
        prefix = '\uD560\uC778\uC728 YoY \uAC10\uC18C\uC640 \uD568\uAED8 \uD310\uB9E4 YoY \uD569\uAE68 (\uC218\uC694 \uBC29\uC5B4 \uBCF4\uC644 \uD544\uC694)';
      } else if (discountDiff > 0 && salesImproved) {
        prefix = '\uD560\uC778\uC728 YoY \uD655\uB300\uB85C \uD310\uB9E4 YoY \uAC1C\uC120 (\uD6A8\uACFC-\uB9C8\uC9C4 \uADE0\uD615 \uC810\uAC80)';
      } else if (discountDiff > 0 && salesWeakened) {
        prefix = '\uD560\uC778\uC728 YoY \uD655\uB300\uC5D0\uB3C4 \uD310\uB9E4 YoY \uAC1C\uC120 \uC81C\uD55C (\uD310\uCD09 \uD6A8\uC728 \uC800\uD558)';
      } else if (discountDiff === 0) {
        prefix = '\uD560\uC778\uC728 YoY \uBCF4\uD569 \uC720\uC9C0 \uAD6C\uAC04\uC5D0\uC11C \uD310\uB9E4 YoY \uBCC0\uD654 \uAD00\uCC30';
      }
    }

    return `${prefix}(\uB3D9\uB9E4\uC7A5 ${fmtPercent(sameYoy)}, \uC804\uCCB4 ${fmtPercent(totalYoy)}, \uD560\uC778\uC728 ${formatKoDelta(discountDiff)})`;
  };
  const getSeasonProgress = (asOfDate: string) => {
    const d = new Date(`${asOfDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    let start: Date;
    let end: Date;

    // SS: 3/1~8/31, FW: 9/1~2/말일
    if (month >= 3 && month <= 8) {
      start = new Date(year, 2, 1);
      end = new Date(year, 7, 31);
    } else if (month >= 9) {
      start = new Date(year, 8, 1);
      end = new Date(year + 1, 1, new Date(year + 1, 2, 0).getDate());
    } else {
      start = new Date(year - 1, 8, 1);
      end = new Date(year, 1, new Date(year, 2, 0).getDate());
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
    const elapsedRaw = Math.floor((d.getTime() - start.getTime()) / msPerDay) + 1;
    const elapsedDays = Math.max(0, Math.min(totalDays, elapsedRaw));
    const progressRate = totalDays > 0 ? (elapsedDays / totalDays) * 100 : null;

    return { progressRate, elapsedDays, totalDays };
  };
  const buildKoInSeasonStatus = (sellthrough: number | null, topCats: string, progressRate: number | null) => {
    if (sellthrough === null || progressRate === null) {
      return `\uC2DC\uC98C \uACBD\uACFC \uAE30\uC900 \uD310\uB9E4\uC728 \uD398\uC774\uC2A4 \uC0B0\uCD9C \uB370\uC774\uD130 \uD655\uC778 \uD544\uC694`;
    }
    const paceGap = sellthrough - progressRate;
    const gapText = formatKoDelta(paceGap);
    if (paceGap >= 12) {
      return `\uC2DC\uC98C \uACBD\uACFC\uC728(\uAE30\uB300 ${progressRate.toFixed(1)}%) \uB300\uBE44 \uD310\uB9E4\uC728\uC774 \uD070 \uD3ED \uC120\uD589(\uC2E4\uC81C ${sellthrough.toFixed(1)}%, \uAC29 ${gapText})\uD558\uC5EC \uC8FC\uB825 \uC81C\uD488 \uC804\uD658 \uC6B0\uC120`;
    }
    if (paceGap >= 5) {
      return `\uC2DC\uC98C \uACBD\uACFC\uC728(\uAE30\uB300 ${progressRate.toFixed(1)}%) \uB300\uBE44 \uD310\uB9E4\uC728 \uC120\uD589(\uC2E4\uC81C ${sellthrough.toFixed(1)}%, \uAC29 ${gapText}) \uAD6C\uAC04\uC73C\uB85C \uC8FC\uB825 \uC804\uD658 \uC900\uBE44 \uAC00\uC18D`;
    }
    if (paceGap <= -5) {
      return `\uC2DC\uC98C \uACBD\uACFC\uC728(\uAE30\uB300 ${progressRate.toFixed(1)}%) \uB300\uBE44 \uD310\uB9E4\uC728 \uC9C0\uC5F0(\uC2E4\uC81C ${sellthrough.toFixed(1)}%, \uAC29 ${gapText})\uC73C\uB85C \uD310\uCD09/\uB178\uCD9C \uBCF4\uC644 \uC6B0\uC120`;
    }
    return `\uC2DC\uC98C \uACBD\uACFC\uC728(\uAE30\uB300 ${progressRate.toFixed(1)}%) \uB300\uBE44 \uD310\uB9E4\uC728 \uC720\uC0AC(\uC2E4\uC81C ${sellthrough.toFixed(1)}%, \uAC29 ${gapText}) \uAD6C\uAC04`;
  };
  const buildKoOldSeasonStatus = (
    oldYoy: number | null,
    invDays: number | null,
    stagnantRatio: number | null,
    share2yPlus: number | null,
    share3yPlus: number | null
  ) => {
    const invText = invDays === null ? '' : `재고일수 ${Math.round(invDays)}일`;
    const stagnantText = stagnantRatio === null ? '' : `정체비중 ${stagnantRatio.toFixed(1)}%`;
    const share2Text = share2yPlus === null ? '' : `2년차+ ${share2yPlus.toFixed(1)}%`;
    const share3Text = share3yPlus === null ? '' : `3년차+ ${share3yPlus.toFixed(1)}%`;
    const oldYoyText = oldYoy === null ? 'N/A' : `${oldYoy.toFixed(0)}%`;
    const metrics = [invText, stagnantText, share2Text, share3Text].filter(Boolean).join(', ');

    if ((invDays ?? 0) >= 180 || (share3yPlus ?? 0) >= 25 || (stagnantRatio ?? 0) >= 35) {
      return `재고일수/정체비중/3년차+ 비중 기준 고위험 구간${metrics ? `(${metrics})` : ''}`;
    }
    if ((invDays ?? 0) >= 120 || (share2yPlus ?? 0) >= 45 || (stagnantRatio ?? 0) >= 25) {
      return `재고일수/연차구성 기준 부담 확대 구간${metrics ? `(${metrics})` : ''}`;
    }
    return `잔액 YoY ${oldYoyText}는 보조지표로 참고, 재고일수/연차구성 기준 관리 가능 구간${metrics ? `(${metrics})` : ''}`;
  };
  const seasonProgress = getSeasonProgress(input.asOfDate);
  const seasonProgressRate = seasonProgress?.progressRate ?? null;
  const normalizedActions =
    language === 'ko'
      ? [
          {
            priority: 'HKMC' as const,
            text: `[\uB9E4\uC7A5] \uD604\uD669: ${buildKoStoreDiagnosis(discountRateDiffHkmc, sameMtdHkmc, salesMtdHkmc)} / \uB300\uC0C1: \uD558\uC704 \uC810\uD3EC 10\uAC1C / \uC2E4\uD589: \uC9C4\uC5F4+\uAC00\uACA9 \uC7AC\uBC30\uCE58 / \uC218\uCE58\uBAA9\uD45C: \uB3D9\uB9E4\uC7A5 YoY +1.5%p / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 +1.5%p \uC774\uC0C1+\uD310\uB9E4 YoY<100 \uC2DC \uC911\uB2E8/\uC804\uD658`,
          },
          {
            priority: 'HKMC' as const,
            text: `[\uB2F9\uC2DC\uC98C] \uD604\uD669: ${buildKoInSeasonStatus(seasonHkmc, seasonTopHkmcText, seasonProgressRate)} / \uB300\uC0C1: TOP3(${seasonTopHkmcText}) / \uC2E4\uD589: \uC2DC\uC98C \uC120\uD589 \uAD6C\uAC04\uC740 \uC8FC\uB825 \uC81C\uD488 \uC804\uD658 \uAC00\uC18D, \uC9C0\uC5F0 \uAD6C\uAC04\uC740 \uC120\uD0DD \uD310\uCD09+\uB178\uCD9C \uBCF4\uC644 / \uC218\uCE58\uBAA9\uD45C: \uD310\uB9E4\uC728 ${fmtPercent(seasonHkmc, 1)}\u2192${fmtPercent((seasonHkmc ?? 0) + 2.0, 1)} / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 \uC99D\uAC10 ${formatKoDelta(discountRateDiffHkmc)} \uD655\uB300 \uC2DC \uB9C8\uC9C4 \uD6FC\uC190`,
          },
          {
            priority: 'HKMC' as const,
            text: `[\uACFC\uC2DC\uC98C] \uD604\uD669: ${buildKoOldSeasonStatus(oldStockYoyHkmc, oldInvDaysHkmc, stagnantRatioHkmc, old2yShareHkmc, old3yShareHkmc)} / \uB300\uC0C1: \uC7AC\uACE0 \uC0C1\uC704 3\uCE74\uD14C\uACE0\uB9AC / \uC2E4\uD589: \uD074\uB9AC\uC5B4\uB7F0\uC2A4+\uCC44\uB110 \uC774\uAD00 / \uC218\uCE58\uBAA9\uD45C: \uC794\uC561 YoY -10%p / \uAE30\uAC04: 4\uC8FC / \uB9AC\uC2A4\uD06C: \uC794\uC561 YoY 120% \uCD08\uACFC \uC2DC \uC989\uC2DC \uC7AC\uACE0\uC18C\uC9C4 \uC804\uD658`,
          },
          {
            priority: 'TW' as const,
            text: `[\uB9E4\uC7A5] \uD604\uD669: ${buildKoStoreDiagnosis(discountRateDiffTw, sameMtdTw, salesMtdTw)} / \uB300\uC0C1: \uC628/\uC624\uD504 \uD558\uC704 \uCC44\uB110 / \uC2E4\uD589: \uCC44\uB110 \uBD84\uB9AC \uC6B4\uC601 / \uC218\uCE58\uBAA9\uD45C: \uB3D9\uB9E4\uC7A5 YoY +1.5%p / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 +1.5%p \uC774\uC0C1+\uD310\uB9E4 YoY<100 \uC2DC \uC911\uB2E8/\uC804\uD658`,
          },
          {
            priority: 'TW' as const,
            text: `[\uB2F9\uC2DC\uC98C] \uD604\uD669: ${buildKoInSeasonStatus(seasonTw, seasonTopTwText, seasonProgressRate)} / \uB300\uC0C1: TOP3(${seasonTopTwText}) / \uC2E4\uD589: \uC2DC\uC98C \uC120\uD589 \uAD6C\uAC04\uC740 \uC8FC\uB825 \uC81C\uD488 \uC804\uD658 \uAC00\uC18D, \uC9C0\uC5F0 \uAD6C\uAC04\uC740 \uC0C1\uC7043 \uD310\uCD09+\uD558\uC7043 \uD560\uC778\uAD6C\uAC04 \uC870\uC815 / \uC218\uCE58\uBAA9\uD45C: \uD310\uB9E4\uC728 ${fmtPercent(seasonTw, 1)}\u2192${fmtPercent((seasonTw ?? 0) + 1.5, 1)} / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 \uC99D\uAC10 ${formatKoDelta(discountRateDiffTw)} \uD655\uB300 \uC2DC \uAC1D\uB2E8\uAC00 \uD558\uB77D`,
          },
          {
            priority: 'TW' as const,
            text: `[\uACFC\uC2DC\uC98C] \uD604\uD669: ${buildKoOldSeasonStatus(oldStockYoyTw, oldInvDaysTw, stagnantRatioTw, old2yShareTw, old3yShareTw)} / \uB300\uC0C1: \uACFC\uC2DC\uC98C \uC0C1\uC704 \uC7AC\uACE0 \uAD6C\uAC04 / \uC2E4\uD589: \uBB36\uC74C\uD310\uB9E4+\uC628\uB77C\uC778 \uD074\uB9AC\uC5B4\uB7F0\uC2A4 \uD398\uC774\uC9C0 / \uC218\uCE58\uBAA9\uD45C: \uC794\uC561 YoY -8%p / \uAE30\uAC04: 4\uC8FC / \uB9AC\uC2A4\uD06C: \uC794\uC561 YoY 120% \uCD08\uACFC \uC2DC \uC989\uC2DC \uC7AC\uACE0\uC18C\uC9C4 \uC804\uD658`,
          },
        ]
      : [
          {
            priority: 'HKMC' as const,
            text: `[Store] Target: same-store gap (HKMC ${fmtPercent(sameMtdHkmc)} vs total ${fmtPercent(salesMtdHkmc)}) / Action: relayout+repricing for bottom 10 stores / Numeric goal: +1.5pp / Period: 2 weeks / Risk: if discount delta >= +1.5pp and sales YoY <100, stop and switch`,
          },
          {
            priority: 'HKMC' as const,
            text: `[In-season] Target: TOP3 (${seasonTopHkmcText}) / Action: selective markdown on 20 low-rotation SKUs / Numeric goal: sell-through +2.0pp / Period: 2 weeks / Risk: rising discount delta may damage margin`,
          },
          {
            priority: 'HKMC' as const,
            text: `[Old-season] Target: old balance YoY ${fmtPercent(oldStockYoyHkmc, 0)} / Action: clearance + channel transfer / Numeric goal: balance YoY -10pp / Period: 4 weeks / Risk: if old-season balance YoY >120%, switch immediately`,
          },
          {
            priority: 'TW' as const,
            text: `[Store] Target: same-store gap (TW ${fmtPercent(sameMtdTw)} vs total ${fmtPercent(salesMtdTw)}) / Action: split offline/online execution / Numeric goal: +1.5pp / Period: 2 weeks / Risk: if discount delta >= +1.5pp and sales YoY <100, stop and switch`,
          },
          {
            priority: 'TW' as const,
            text: `[In-season] Target: TOP3 (${seasonTopTwText}) / Action: push top3 + reset markdown for bottom3 / Numeric goal: sell-through +1.5pp / Period: 2 weeks / Risk: rising discount delta may hurt AUR`,
          },
          {
            priority: 'TW' as const,
            text: `[Old-season] Target: old balance YoY ${fmtPercent(oldStockYoyTw, 0)} / Action: bundle sale + online clearance page / Numeric goal: balance YoY -8pp / Period: 4 weeks / Risk: if old-season balance YoY >120%, switch immediately`,
          },
        ];

  const rewrittenActions = await rewriteActionsWithOpenAI(
    language,
    input.brand,
    input.asOfDate,
    mode,
    normalizedActions
  );
  const finalActions = rewrittenActions.map((action) => ({
    ...action,
    text: normalizeStrategyText(action.text),
  }));

  return {
    title: 'Executive Insight',
    asOfLabel: `${input.asOfDate} | ${input.brand} | ${mode}`,
    summaryLine: '',
    compareLine: '',
    blocks,
    actions: finalActions,
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
    f(input.hkmc.sameStoreMtdYoy),
    f(input.hkmc.sameStoreYtdYoy),
    f(input.hkmc.seasonSellthrough),
    f(input.hkmc.seasonSellthroughYoyPp),
    f(input.hkmc.discountRateMtd),
    f(input.hkmc.discountRateYtd),
    f(input.hkmc.discountRateMtdDiff),
    f(input.hkmc.discountRateYtdDiff),
    f(input.hkmc.oldStock),
    f(input.hkmc.oldStockYoy),
    f(input.hkmc.invDays),
    f(input.hkmc.oldStock2yPlusShare),
    f(input.hkmc.oldStock3yPlusShare),
    f(input.hkmc.stagnantRatio),
    f(input.tw.salesMtdYoy),
    f(input.tw.salesYtdYoy),
    f(input.tw.sameStoreMtdYoy),
    f(input.tw.sameStoreYtdYoy),
    f(input.tw.seasonSellthrough),
    f(input.tw.seasonSellthroughYoyPp),
    f(input.tw.discountRateMtd),
    f(input.tw.discountRateYtd),
    f(input.tw.discountRateMtdDiff),
    f(input.tw.discountRateYtdDiff),
    f(input.tw.oldStock),
    f(input.tw.oldStockYoy),
    f(input.tw.invDays),
    f(input.tw.oldStock2yPlusShare),
    f(input.tw.oldStock3yPlusShare),
    f(input.tw.stagnantRatio),
    (input.hkmc.seasonTopCategories || []).join(','),
    (input.tw.seasonTopCategories || []).join(','),
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
      'v22',
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
      return NextResponse.json({
        ...cached,
        meta: {
          model: cached.meta?.model || MODEL,
          cached: true,
          generatedAt: cached.meta?.generatedAt || new Date().toISOString(),
          ttlSeconds: cached.meta?.ttlSeconds || ttlSeconds,
        },
      });
    }

    const generated = await buildInsight(input);
    const final: ExecutiveInsightResponse = {
      ...generated,
      meta: {
        model: MODEL,
        cached: false,
        generatedAt: new Date().toISOString(),
        ttlSeconds,
      },
    };

    await cacheSet(cacheKey, final, ttlSeconds);
    return NextResponse.json(final);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate executive insight' }, { status: 500 });
  }
}


