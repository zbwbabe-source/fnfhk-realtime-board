import { NextResponse } from 'next/server';
import { buildKey, cacheGet, cacheSet } from '@/lib/cache';
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

const MODEL = 'rule-based-v2';
type InsightLanguage = 'ko' | 'en';

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
  if (v < 0) return `△${Math.abs(v).toFixed(1)}%p`;
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

function buildInsight(input: ExecutiveInsightInput): Omit<ExecutiveInsightResponse, 'meta'> {
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
      label: language === 'ko' ? '매출' : 'Sales',
      tone: toneByDelta((salesHkmc ?? 0) - (salesTw ?? 0)),
      text:
        language === 'ko'
          ? mode === 'YTD'
            ? `누적 YoY HKMC ${fmtPercent(salesYtdHkmc)}, TW ${fmtPercent(salesYtdTw)} | 누적 동매장 HKMC ${fmtPercent(sameYtdHkmc)}, TW ${fmtPercent(sameYtdTw)}`
            : `당월 YoY HKMC ${fmtPercent(salesHkmc)}, TW ${fmtPercent(salesTw)} | 동매장 HKMC ${fmtPercent(sameHkmc)}, TW ${fmtPercent(sameTw)}`
          : mode === 'YTD'
            ? `YTD YoY HKMC ${fmtPercent(salesYtdHkmc)}, TW ${fmtPercent(salesYtdTw)} | YTD same-store HKMC ${fmtPercent(sameYtdHkmc)}, TW ${fmtPercent(sameYtdTw)}`
            : `MTD YoY HKMC ${fmtPercent(salesHkmc)}, TW ${fmtPercent(salesTw)} | Same-store HKMC ${fmtPercent(sameHkmc)}, TW ${fmtPercent(sameTw)}`,
    },
    {
      id: 'season',
      label: language === 'ko' ? '당시즌 판매율' : 'In-season Sell-through',
      tone: toneByDelta((seasonPpHkmc ?? 0) - (seasonPpTw ?? 0)),
      text:
        language === 'ko'
          ? `HKMC ${fmtPercent(seasonHkmc, 1)} (${fmtPp(seasonPpHkmc, language)})\nTOP3: ${seasonTopHkmcText}\nTW ${fmtPercent(seasonTw, 1)} (${fmtPp(seasonPpTw, language)})\nTOP3: ${seasonTopTwText}`
          : `HKMC ${fmtPercent(seasonHkmc, 1)} (${fmtPp(seasonPpHkmc, language)})\nTOP3: ${seasonTopHkmcText}\nTW ${fmtPercent(seasonTw, 1)} (${fmtPp(seasonPpTw, language)})\nTOP3: ${seasonTopTwText}`,
    },
    {
      id: 'old',
      label: language === 'ko' ? '과시즌' : 'Old-season',
      tone: toneByDelta((oldStockYoyHkmc ?? 0) - (oldStockYoyTw ?? 0)),
      text:
        language === 'ko'
          ? `과시즌 잔액 YoY: HKMC ${fmtPercent(oldStockYoyHkmc, 1)} (${fmtNum(oldStockHkmc)}), TW ${fmtPercent(oldStockYoyTw, 1)} (${fmtNum(oldStockTw)}).`
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
            text: `HKMC는 매출/동매장/판매율 변화가 동시에 보이는 카테고리 중심으로 주간 실행안을 1개로 통합해 운영하세요.`,
          },
          {
            priority: 'TW' as const,
            text: `TW는 판매율 증감과 과시즌 잔액 YoY를 함께 보면서, 저효율 카테고리 2주 액션을 우선 실행하세요.`,
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
    if (v < 0) return `△${Math.abs(v).toFixed(1)}%p`;
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
            text: `대상 ${hkmcFocusCats} / 실행 2주 선택할인(저회전 SKU 중심) / 목표 판매율 +${hkmcTargetPp.toFixed(1)}%p, 동매장 YoY ${fmtPercent(sameMtdHkmc)}→${fmtPercent((sameMtdHkmc ?? 100) + hkmcTargetPp)} / 기간 2주 / 리스크 할인율 증감 ${fmtKoDiff(discountRateDiffHkmc)}가 +이면 마진 훼손 위험.`,
          },
          {
            priority: 'TW' as const,
            text: `대상 ${twFocusCats} / 실행 과시즌 잔액 YoY ${fmtPercent(oldStockYoyTw, 0)} 구간 우선 클리어런스 / 목표 판매율 +${twTargetPp.toFixed(1)}%p, 누적판매 YoY ${fmtPercent(salesYtdTw)} 유지 / 기간 2주(3일 간격 점검) / 리스크 할인율 증감 ${fmtKoDiff(discountRateDiffTw)}가 +이면 객단가 하락 위험.`,
          },
        ]
      : [
          {
            priority: 'HKMC' as const,
            text: `Target ${hkmcFocusCats} / Action selective markdown for 2 weeks (low-rotation SKUs) / Goal sell-through +${hkmcTargetPp.toFixed(1)}pp, same-store YoY ${fmtPercent(sameMtdHkmc)}→${fmtPercent((sameMtdHkmc ?? 100) + hkmcTargetPp)} / Window 2 weeks / Risk discount delta ${fmtEnDiff(discountRateDiffHkmc)} with plus side can damage margin.`,
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
    const prefix =
      discountDiff === null
        ? '할인율-매출 연동 점검 필요'
        : discountDiff > 0
          ? '할인율 증가 대비 판매 방어 약함'
          : discountDiff < 0
            ? '할인율 감소에도 판매 회복 지연'
            : '할인율 정체 대비 판매 반등 제한';
    return `${prefix}(동매장 ${fmtPercent(sameYoy)}, 전체 ${fmtPercent(totalYoy)})`;
  };
  const normalizedActions =
    language === 'ko'
      ? [
          {
            priority: 'HKMC' as const,
            text: `[\uB9E4\uC7A5] \uC9C4\uB2E8: ${buildKoStoreDiagnosis(discountRateDiffHkmc, sameMtdHkmc, salesMtdHkmc)} / \uB300\uC0C1: \uD558\uC704 \uC810\uD3EC 10\uAC1C / \uC2E4\uD589: \uC9C4\uC5F4+\uAC00\uACA9 \uC7AC\uBC30\uCE58 / \uC218\uCE58\uBAA9\uD45C: \uB3D9\uB9E4\uC7A5 YoY +1.5%p / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 +1.5%p \uC774\uC0C1+\uD310\uB9E4 YoY<100 \uC2DC \uC911\uB2E8/\uC804\uD658`,
          },
          {
            priority: 'HKMC' as const,
            text: `[\uB2F9\uC2DC\uC98C] \uC9C4\uB2E8: \uCE74\uD14C\uACE0\uB9AC TOP3(${seasonTopHkmcText})\uC5D0\uC11C \uD560\uC778\uC728 \uBCC0\uD654 \uB300\uBE44 \uD310\uB9E4\uC728 \uD68C\uBCF5 \uC18D\uB3C4 \uB355 / \uB300\uC0C1: TOP3(${seasonTopHkmcText}) / \uC2E4\uD589: \uC800\uD68C\uC804 SKU 20\uAC1C \uC120\uD0DD\uD560\uC778+\uB178\uCD9C \uC7AC\uBC30\uCE58 / \uC218\uCE58\uBAA9\uD45C: \uD310\uB9E4\uC728 ${fmtPercent(seasonHkmc, 1)}\u2192${fmtPercent((seasonHkmc ?? 0) + 2.0, 1)} / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 \uC99D\uAC10 ${formatKoDelta(discountRateDiffHkmc)} \uD655\uB300 \uC2DC \uB9C8\uC9C4 \uD6FC\uC190`,
          },
          {
            priority: 'HKMC' as const,
            text: `[\uACFC\uC2DC\uC98C] \uC9C4\uB2E8: \uACFC\uC2DC\uC98C \uC794\uC561 YoY ${fmtPercent(oldStockYoyHkmc, 0)}\uB85C \uC7AC\uACE0 \uB204\uC801 \uB9AC\uC2A4\uD06C \uD655\uB300 / \uB300\uC0C1: \uC7AC\uACE0 \uC0C1\uC704 3\uCE74\uD14C\uACE0\uB9AC / \uC2E4\uD589: \uD074\uB9AC\uC5B4\uB7F0\uC2A4+\uCC44\uB110 \uC774\uAD00 / \uC218\uCE58\uBAA9\uD45C: \uC794\uC561 YoY -10%p / \uAE30\uAC04: 4\uC8FC / \uB9AC\uC2A4\uD06C: \uC794\uC561 YoY 120% \uCD08\uACFC \uC2DC \uC989\uC2DC \uC7AC\uACE0\uC18C\uC9C4 \uC804\uD658`,
          },
          {
            priority: 'TW' as const,
            text: `[\uB9E4\uC7A5] \uC9C4\uB2E8: ${buildKoStoreDiagnosis(discountRateDiffTw, sameMtdTw, salesMtdTw)} / \uB300\uC0C1: \uC628/\uC624\uD504 \uD558\uC704 \uCC44\uB110 / \uC2E4\uD589: \uCC44\uB110 \uBD84\uB9AC \uC6B4\uC601 / \uC218\uCE58\uBAA9\uD45C: \uB3D9\uB9E4\uC7A5 YoY +1.5%p / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 +1.5%p \uC774\uC0C1+\uD310\uB9E4 YoY<100 \uC2DC \uC911\uB2E8/\uC804\uD658`,
          },
          {
            priority: 'TW' as const,
            text: `[\uB2F9\uC2DC\uC98C] \uC9C4\uB2E8: TOP3(${seasonTopTwText})\uC5D0\uC11C \uD560\uC778\uC728 \uBCC0\uD654 \uB300\uBE44 \uD310\uB9E4\uC728 \uBC18\uC751 \uBD80\uC871 / \uB300\uC0C1: TOP3(${seasonTopTwText}) / \uC2E4\uD589: \uC0C1\uC7043 \uD310\uCD09+\uD558\uC7043 \uD560\uC778\uAD6C\uAC04 \uC870\uC815 / \uC218\uCE58\uBAA9\uD45C: \uD310\uB9E4\uC728 ${fmtPercent(seasonTw, 1)}\u2192${fmtPercent((seasonTw ?? 0) + 1.5, 1)} / \uAE30\uAC04: 2\uC8FC / \uB9AC\uC2A4\uD06C: \uD560\uC778\uC728 \uC99D\uAC10 ${formatKoDelta(discountRateDiffTw)} \uD655\uB300 \uC2DC \uAC1D\uB2E8\uAC00 \uD558\uB77D`,
          },
          {
            priority: 'TW' as const,
            text: `[\uACFC\uC2DC\uC98C] \uC9C4\uB2E8: \uACFC\uC2DC\uC98C \uC794\uC561 YoY ${fmtPercent(oldStockYoyTw, 0)}\uB85C \uCC44\uB110 \uBD80\uB2F4 \uD655\uB300 / \uB300\uC0C1: \uACFC\uC2DC\uC98C \uC0C1\uC704 \uC7AC\uACE0 \uAD6C\uAC04 / \uC2E4\uD589: \uBB36\uC74C\uD310\uB9E4+\uC628\uB77C\uC778 \uD074\uB9AC\uC5B4\uB7F0\uC2A4 \uD398\uC774\uC9C0 / \uC218\uCE58\uBAA9\uD45C: \uC794\uC561 YoY -8%p / \uAE30\uAC04: 4\uC8FC / \uB9AC\uC2A4\uD06C: \uC794\uC561 YoY 120% \uCD08\uACFC \uC2DC \uC989\uC2DC \uC7AC\uACE0\uC18C\uC9C4 \uC804\uD658`,
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

  return {
    title: 'Executive Insight',
    asOfLabel: `${input.asOfDate} | ${input.brand} | ${mode}`,
    summaryLine: '',
    compareLine: '',
    blocks,
    actions: normalizedActions,
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

    const generated = buildInsight(input);
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
