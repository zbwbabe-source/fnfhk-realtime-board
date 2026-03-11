'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { t, type Language } from '@/lib/translations';
import type { ExecutiveInsightResponse } from '@/lib/insights/types';

interface DailyHighlightProps {
  date: string;
  brand: string;
  language: Language;
  isYtdMode: boolean;
  hkmcSection1Data: any;
  hkmcSection2Data: any;
  hkmcSection3Data: any;
  twSection1Data: any;
  twSection2Data: any;
  twSection3Data: any;
}

export default function DailyHighlight({
  date,
  brand,
  language,
  isYtdMode,
  hkmcSection1Data,
  hkmcSection2Data,
  hkmcSection3Data,
  twSection1Data,
  twSection2Data,
  twSection3Data,
}: DailyHighlightProps) {
  const [data, setData] = useState<ExecutiveInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [hkmcOpinion, setHkmcOpinion] = useState('');
  const [twOpinion, setTwOpinion] = useState('');
  const [isHkmcEditing, setIsHkmcEditing] = useState(false);
  const [isTwEditing, setIsTwEditing] = useState(false);
  const [opinionLoading, setOpinionLoading] = useState(false);
  const [hkmcOpinionSaving, setHkmcOpinionSaving] = useState(false);
  const [twOpinionSaving, setTwOpinionSaving] = useState(false);
  const [hkmcOpinionSavedAt, setHkmcOpinionSavedAt] = useState<string | null>(null);
  const [twOpinionSavedAt, setTwOpinionSavedAt] = useState<string | null>(null);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);
  const isInsightInputReady =
    !!hkmcSection1Data?.total_subtotal &&
    !!twSection1Data?.total_subtotal &&
    !!hkmcSection2Data?.header &&
    !!twSection2Data?.header &&
    !!hkmcSection3Data?.header &&
    !!twSection3Data?.header;

  const inputPayload = useMemo(() => {
    const toPercent = (value: unknown): number | null => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      return Math.abs(value) <= 1 ? value * 100 : value;
    };

    const hkmcStagnantRatio =
      (hkmcSection3Data?.header?.curr_stock_amt || 0) > 0
        ? ((hkmcSection3Data?.header?.stagnant_stock_amt || 0) / hkmcSection3Data?.header?.curr_stock_amt) * 100
        : null;
    const twStagnantRatio =
      (twSection3Data?.header?.curr_stock_amt || 0) > 0
        ? ((twSection3Data?.header?.stagnant_stock_amt || 0) / twSection3Data?.header?.curr_stock_amt) * 100
        : null;
    const hkmcPrevStagnantRatio = toPercent(hkmcSection3Data?.header?.prev_month_stagnant_ratio);
    const twPrevStagnantRatio = toPercent(twSection3Data?.header?.prev_month_stagnant_ratio);
    const getOldDiscountRatePct = (header: any): number | null => {
      const periodTagSales = typeof header?.period_tag_sales === 'number' ? header.period_tag_sales : 0;
      const periodActSales = typeof header?.period_act_sales === 'number' ? header.period_act_sales : 0;
      if (periodTagSales > 0 && Number.isFinite(periodActSales)) {
        return (1 - periodActSales / periodTagSales) * 100;
      }
      const rawDiscountRate = typeof header?.discount_rate === 'number' ? header.discount_rate : null;
      if (rawDiscountRate === null || !Number.isFinite(rawDiscountRate)) return null;
      return Math.abs(rawDiscountRate) <= 1 ? rawDiscountRate * 100 : rawDiscountRate;
    };
    const getOldDiscountRateDiffPct = (header: any): number | null => {
      const currentRate = getOldDiscountRatePct(header);
      const lyTagSales = typeof header?.period_tag_sales_ly === 'number' ? header.period_tag_sales_ly : 0;
      const lyActSales = typeof header?.period_act_sales_ly === 'number' ? header.period_act_sales_ly : 0;
      if (currentRate === null || lyTagSales <= 0 || !Number.isFinite(lyActSales)) return null;
      const lyRate = (1 - lyActSales / lyTagSales) * 100;
      return currentRate - lyRate;
    };
    const getTopSeasonCategories = (rows: any): string[] => {
      if (!Array.isArray(rows)) return [];
      return rows
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          name: String(item.category ?? '').trim(),
          sellthrough: typeof item.sellthrough === 'number' && Number.isFinite(item.sellthrough) ? item.sellthrough : null,
        }))
        .filter((item) => !!item.name && item.sellthrough !== null)
        .sort((a, b) => (b.sellthrough ?? 0) - (a.sellthrough ?? 0))
        .slice(0, 3)
        .map((item) => `${item.name}(${(item.sellthrough as number).toFixed(1)}%)`);
    };

    return {
      brand,
      asOfDate: date,
      mode: isYtdMode ? 'YTD' : 'MTD',
      language,
      region: 'ALL',
      hkmc: {
        salesMtdYoy: hkmcSection1Data?.total_subtotal?.yoy ?? null,
        salesYtdYoy: hkmcSection1Data?.total_subtotal?.yoy_ytd ?? null,
        sameStoreMtdYoy: hkmcSection1Data?.total_subtotal?.same_store_yoy ?? null,
        sameStoreYtdYoy: hkmcSection1Data?.total_subtotal?.same_store_yoy_ytd ?? null,
        seasonSellthrough: hkmcSection2Data?.header?.overall_sellthrough ?? null,
        seasonSellthroughYoyPp: hkmcSection2Data?.header?.sellthrough_yoy_pp ?? null,
        seasonTopCategories: getTopSeasonCategories(hkmcSection2Data?.categories),
        discountRateMtd: getOldDiscountRatePct(hkmcSection3Data?.header),
        discountRateYtd: null,
        discountRateMtdDiff: getOldDiscountRateDiffPct(hkmcSection3Data?.header),
        discountRateYtdDiff: null,
        oldStock: hkmcSection3Data?.header?.curr_stock_amt ?? null,
        oldStockYoy: hkmcSection3Data?.header?.curr_stock_yoy_pct ?? null,
        invDays: hkmcSection3Data?.header?.inv_days ?? null,
        stagnantRatio: hkmcStagnantRatio,
        stagnantRatioChange:
          hkmcStagnantRatio !== null && hkmcPrevStagnantRatio !== null
            ? hkmcStagnantRatio - hkmcPrevStagnantRatio
            : null,
      },
      tw: {
        salesMtdYoy: twSection1Data?.total_subtotal?.yoy ?? null,
        salesYtdYoy: twSection1Data?.total_subtotal?.yoy_ytd ?? null,
        sameStoreMtdYoy: twSection1Data?.total_subtotal?.same_store_yoy ?? null,
        sameStoreYtdYoy: twSection1Data?.total_subtotal?.same_store_yoy_ytd ?? null,
        seasonSellthrough: twSection2Data?.header?.overall_sellthrough ?? null,
        seasonSellthroughYoyPp: twSection2Data?.header?.sellthrough_yoy_pp ?? null,
        seasonTopCategories: getTopSeasonCategories(twSection2Data?.categories),
        discountRateMtd: getOldDiscountRatePct(twSection3Data?.header),
        discountRateYtd: null,
        discountRateMtdDiff: getOldDiscountRateDiffPct(twSection3Data?.header),
        discountRateYtdDiff: null,
        oldStock: twSection3Data?.header?.curr_stock_amt ?? null,
        oldStockYoy: twSection3Data?.header?.curr_stock_yoy_pct ?? null,
        invDays: twSection3Data?.header?.inv_days ?? null,
        stagnantRatio: twStagnantRatio,
        stagnantRatioChange:
          twStagnantRatio !== null && twPrevStagnantRatio !== null
            ? twStagnantRatio - twPrevStagnantRatio
            : null,
      },
    };
  }, [
    brand,
    date,
    isYtdMode,
    language,
    hkmcSection1Data,
    hkmcSection2Data,
    hkmcSection3Data,
    twSection1Data,
    twSection2Data,
    twSection3Data,
  ]);

  useEffect(() => {
    if (!date || !brand || !isInsightInputReady) return;
    let mounted = true;

    async function fetchInsight() {
      if (mounted) {
        setData(null);
      }
      setLoading(true);
      try {
        const response = await fetch('/api/insights/dashboard?forceRefresh=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            ...inputPayload,
            skip_cache: true,
          }),
        });
        if (!response.ok) return;
        const json = (await response.json()) as ExecutiveInsightResponse;
        if (mounted) {
          setData(json);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchInsight();
    return () => {
      mounted = false;
    };
  }, [inputPayload, date, brand, isInsightInputReady]);

  useEffect(() => {
    if (!date || !brand) return;
    let mounted = true;
    setOpinionLoading(true);

    async function fetchOpinion() {
      try {
        const response = await fetch(
          `/api/insights/dashboard/opinion?brand=${encodeURIComponent(brand)}&date=${encodeURIComponent(date)}`,
          { cache: 'no-store' }
        );
        if (!response.ok) return;
        const json = await response.json();
        if (!mounted) return;
        setHkmcOpinion(typeof json?.hkmcOpinion === 'string' ? json.hkmcOpinion : '');
        setTwOpinion(typeof json?.twOpinion === 'string' ? json.twOpinion : '');
        setIsHkmcEditing(false);
        setIsTwEditing(false);
        const savedAt = typeof json?.savedAt === 'string' ? json.savedAt : null;
        setHkmcOpinionSavedAt(savedAt);
        setTwOpinionSavedAt(savedAt);
      } finally {
        if (mounted) setOpinionLoading(false);
      }
    }

    fetchOpinion();
    return () => {
      mounted = false;
    };
  }, [date, brand]);

  const handleSaveHkmcOpinion = async () => {
    if (!date || !brand || hkmcOpinionSaving) return;
    setHkmcOpinionSaving(true);
    try {
      const response = await fetch('/api/insights/dashboard/opinion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          date,
          hkmcOpinion,
        }),
      });
      if (!response.ok) return;
      const json = await response.json();
      setHkmcOpinionSavedAt(typeof json?.savedAt === 'string' ? json.savedAt : new Date().toISOString());
      setIsHkmcEditing(false);
    } finally {
      setHkmcOpinionSaving(false);
    }
  };

  const handleSaveTwOpinion = async () => {
    if (!date || !brand || twOpinionSaving) return;
    setTwOpinionSaving(true);
    try {
      const response = await fetch('/api/insights/dashboard/opinion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          date,
          twOpinion,
        }),
      });
      if (!response.ok) return;
      const json = await response.json();
      setTwOpinionSavedAt(typeof json?.savedAt === 'string' ? json.savedAt : new Date().toISOString());
      setIsTwEditing(false);
    } finally {
      setTwOpinionSaving(false);
    }
  };

  const renderInlineMarkdown = (text: string) => {
    const tokenPattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    return text.split(tokenPattern).map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 3) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 3) {
        return (
          <code key={idx} className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <Fragment key={idx}>{part}</Fragment>;
    });
  };

  const renderMarkdownBlock = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => (
      <p key={idx} className={idx === 0 ? '' : 'mt-1'}>
        {renderInlineMarkdown(line)}
      </p>
    ));
  };

  const toneClass = (tone: ExecutiveInsightResponse['blocks'][number]['tone']) => {
    if (tone === 'positive') return 'text-emerald-700 bg-emerald-50';
    if (tone === 'warning') return 'text-amber-700 bg-amber-50';
    if (tone === 'critical') return 'text-rose-700 bg-rose-50';
    return 'text-gray-600 bg-gray-100';
  };

  const toneTextClass = (tone: ExecutiveInsightResponse['blocks'][number]['tone']) => {
    if (tone === 'positive') return 'text-emerald-700';
    if (tone === 'warning') return 'text-amber-700';
    if (tone === 'critical') return 'text-rose-700';
    return 'text-gray-700';
  };

  const insightBlockContainerClass = (id: ExecutiveInsightResponse['blocks'][number]['id']) => {
    if (id === 'sales') return 'border-rose-100 bg-rose-50/70';
    if (id === 'season') return 'border-amber-100 bg-amber-50/70';
    return 'border-teal-100 bg-teal-50/70';
  };
  const salesYoyClass = (value: number) => (value >= 100 ? 'text-emerald-600' : 'text-rose-600');
  const oldBalanceYoyClass = (value: number) => (value < 100 ? 'text-emerald-600' : 'text-rose-600');
  const oldSalesYoyClass = (value: number) => (value >= 100 ? 'text-emerald-600' : 'text-rose-600');
  const renderSalesLine = (line: string, idx: number) => {
    const prefixMatch = line.match(/^(당월\s전체|당월\s동매장|누적\s전체|누적\s동매장|당월|누적|동매장)\s*/);
    const prefix = prefixMatch?.[1] ?? '';
    const rest = prefix ? line.slice(prefixMatch?.[0]?.length ?? 0) : line;
    const parts = rest.split(/(\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0);

    return (
      <span key={`sales-line-${idx}`} className="font-normal text-gray-800">
        {idx > 0 ? <br /> : null}
        {prefix ? <span className="font-semibold text-gray-900">{prefix} </span> : null}
        {parts.map((part, partIdx) => {
          if (!/^\d+(?:\.\d+)?%$/.test(part)) {
            return <span key={`sales-part-${idx}-${partIdx}`}>{part}</span>;
          }
          const yoyValue = Number.parseFloat(part.replace('%', ''));
          const colorClass = Number.isFinite(yoyValue) ? salesYoyClass(yoyValue) : 'text-gray-800';
          return (
            <span key={`sales-part-${idx}-${partIdx}`} className={`font-semibold ${colorClass}`}>
              {part}
            </span>
          );
        })}
      </span>
    );
  };
  const renderBlockText = (block: ExecutiveInsightResponse['blocks'][number]) => {
    if (block.id === 'sales') {
      return block.text.split('\n').map((line, idx) => renderSalesLine(line, idx));
    }
    if (false) {
      const lines = block.text.split('\n');
      return lines.map((line, idx) => {
        const trimmed = line.trim();
        const isBalanceLine = /^(잔액|Balance)/.test(trimmed);
        const isDiscountLine = /^(할인율|Discount)/.test(trimmed);
        const parts = isDiscountLine
          ? line.split(/(\([+△-]?\d+(?:\.\d+)?%p\)|\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0)
          : line.split(/(\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0);
        return (
          <span key={`old-v2-line-${idx}`} className="font-normal text-gray-800">
            {idx > 0 ? <br /> : null}
            {parts.map((part, partIdx) => {
              if (isDiscountLine && /^\([+△-]?\d+(?:\.\d+)?%p\)$/.test(part)) {
                const raw = Number.parseFloat(part.replace(/[^\d.]/g, ''));
                const diffValue = part.includes('△') || part.includes('-') ? -raw : raw;
                const diffClass =
                  diffValue < 0 ? 'text-emerald-600' : diffValue > 0 ? 'text-rose-600' : 'text-gray-600';
                return (
                  <span key={`old-v2-part-${idx}-${partIdx}`} className={`font-semibold ${diffClass}`}>
                    {part}
                  </span>
                );
              }
              if (!/^\d+(?:\.\d+)?%$/.test(part)) {
                return <span key={`old-v2-part-${idx}-${partIdx}`}>{part}</span>;
              }
              const yoyValue = Number.parseFloat(part.replace('%', ''));
              if (!Number.isFinite(yoyValue)) {
                return <span key={`old-v2-part-${idx}-${partIdx}`}>{part}</span>;
              }
              const colorClass = isDiscountLine
                ? 'text-blue-700 italic'
                : isBalanceLine
                  ? oldBalanceYoyClass(yoyValue)
                  : oldSalesYoyClass(yoyValue);
              return (
                <span key={`old-v2-part-${idx}-${partIdx}`} className={`font-semibold ${colorClass}`}>
                  {part}
                </span>
              );
            })}
          </span>
        );
      });
    }
    if (block.id === 'old') {
      const lines = block.text.split('\n');
      return lines.map((line, idx) => {
        const trimmed = line.trim();
        const isBalanceLine = idx === 0 || /^(잔액|Balance)/.test(trimmed);
        const isDiscountLine = idx === 3 || /^(할인율|Discount)/.test(trimmed) || /%p/.test(trimmed);
        const parts = isDiscountLine
          ? line.split(/(\([^)]+%p\)|\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0)
          : line.split(/(\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0);
        return (
          <span key={`old-line-${idx}`} className="font-normal text-gray-800">
            {idx > 0 ? <br /> : null}
            {parts.map((part, partIdx) => {
              if (isDiscountLine && /^\([^)]+%p\)$/.test(part)) {
                const raw = Number.parseFloat(part.replace(/[^\d.]/g, ''));
                const diffValue = part.includes('△') || part.includes('-') ? -raw : raw;
                const diffClass =
                  diffValue < 0 ? 'text-emerald-600' : diffValue > 0 ? 'text-rose-600' : 'text-gray-600';
                return (
                  <span key={`old-part-${idx}-${partIdx}`} className={`font-semibold ${diffClass}`}>
                    {part}
                  </span>
                );
              }
              if (!/^\d+(?:\.\d+)?%$/.test(part)) {
                return <span key={`old-part-${idx}-${partIdx}`}>{part}</span>;
              }
              const yoyValue = Number.parseFloat(part.replace('%', ''));
              if (!Number.isFinite(yoyValue)) {
                return <span key={`old-part-${idx}-${partIdx}`}>{part}</span>;
              }
              const colorClass = isDiscountLine
                ? 'text-blue-700 italic'
                : isBalanceLine
                  ? oldBalanceYoyClass(yoyValue)
                  : oldSalesYoyClass(yoyValue);
              return (
                <span key={`old-part-${idx}-${partIdx}`} className={`font-semibold ${colorClass}`}>
                  {part}
                </span>
              );
            })}
          </span>
        );
      });
    }
    if (block.id !== 'season') return block.text.replace(/\s*\n\s*/g, ' / ');

    const lines = block.text.split('\n');
    return lines.map((line, idx) => {
      const isMetricLine = idx === 0 || idx === 2;
      return (
        <span key={`${block.id}-${idx}`} className={isMetricLine ? 'font-semibold text-gray-900' : ''}>
          {idx > 0 ? <br /> : null}
          {line}
        </span>
      );
    });
  };

  return (
    <section className="mb-4 rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{data?.title || t(language, 'executiveInsightTitle')}</h2>
        <p className="text-xs text-gray-500">{data?.asOfLabel || `${date} | ${brand} | ${isYtdMode ? 'YTD' : 'MTD'}`}</p>
      </div>

      {loading && !data ? (
        <p className="text-sm text-gray-500">{t(language, 'generatingInsight')}</p>
      ) : (
        <div className="space-y-2">
          {data?.compareLine ? <p className="text-sm text-gray-700">{data.compareLine}</p> : null}

          <div className="grid gap-2 md:grid-cols-3">
            {(data?.blocks || []).map((block) => (
              <div
                key={block.id}
                className={`rounded-xl border px-2.5 py-2 ${insightBlockContainerClass(block.id)}`}
              >
                <div className="flex items-start gap-1.5">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${toneClass(block.tone)}`}>{block.label}</span>
                  <p className={`${toneTextClass(block.tone)} min-w-0 text-xs leading-snug ${block.id === 'sales' || block.id === 'season' || block.id === 'old' ? 'whitespace-pre-line' : ''}`}>
                    {renderBlockText(block)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {language === 'ko' ? 'AI추천전략 / 법인전략' : 'AI Strategy / Subsidiary Strategy'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStrategyPanel((prev) => !prev)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {showStrategyPanel ? (language === 'ko' ? '접기' : 'Collapse') : language === 'ko' ? '펼치기' : 'Expand'}
              </button>
            </div>
            <summary className="hidden">
              {language === 'ko' ? '상세 보기 (AI추천전략 / 법인전략)' : 'Details (AI Strategy / Subsidiary Strategy)'}
            </summary>

            {showStrategyPanel ? (
            <div className="space-y-2 pt-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-900">{t(language, 'aiRecommendedStrategy')}</h3>
                {(data?.actions || []).map((action) => (
                  <p key={action.priority} className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">{action.priority}.</span> {action.text}
                  </p>
                ))}
              </div>

              <div className="space-y-2 pt-1">
                <h3 className="text-sm font-semibold text-gray-900">{language === 'ko' ? '법인전략' : 'Subsidiary Strategy'}</h3>
                <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                  <p className="text-xs font-semibold text-gray-600">{language === 'ko' ? '홍콩법인 의견' : 'HKMC Opinion'}</p>
                  {isHkmcEditing ? (
                    <textarea
                      value={hkmcOpinion}
                      onChange={(e) => setHkmcOpinion(e.target.value)}
                      rows={2}
                      placeholder={language === 'ko' ? '홍콩법인 의견을 입력하세요.' : 'Enter HKMC opinion.'}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  ) : (
                    <div className="min-h-[44px] px-1 py-1 text-sm text-gray-700">
                      {hkmcOpinion ? renderMarkdownBlock(hkmcOpinion) : <p className="text-gray-400">{language === 'ko' ? '의견 없음' : 'No opinion'}</p>}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {opinionLoading
                        ? language === 'ko'
                          ? '불러오는 중...'
                          : 'Loading...'
                        : hkmcOpinionSavedAt
                          ? `${language === 'ko' ? '저장됨' : 'Saved'}: ${hkmcOpinionSavedAt.slice(0, 16).replace('T', ' ')}`
                          : language === 'ko'
                            ? '아직 저장되지 않음'
                            : 'Not saved yet'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (isHkmcEditing) {
                          void handleSaveHkmcOpinion();
                          return;
                        }
                        setIsHkmcEditing(true);
                      }}
                      disabled={hkmcOpinionSaving || opinionLoading}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {hkmcOpinionSaving
                        ? language === 'ko'
                          ? '저장 중...'
                          : 'Saving...'
                        : isHkmcEditing
                          ? language === 'ko'
                            ? '저장'
                            : 'Save'
                          : language === 'ko'
                            ? '편집'
                            : 'Edit'}
                    </button>
                  </div>
                </div>
                <div className="space-y-1 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-xs font-semibold text-gray-600">{language === 'ko' ? '대만법인 의견' : 'TW Opinion'}</p>
                  {isTwEditing ? (
                    <textarea
                      value={twOpinion}
                      onChange={(e) => setTwOpinion(e.target.value)}
                      rows={2}
                      placeholder={language === 'ko' ? '대만법인 의견을 입력하세요.' : 'Enter TW opinion.'}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  ) : (
                    <div className="min-h-[44px] px-1 py-1 text-sm text-gray-700">
                      {twOpinion ? renderMarkdownBlock(twOpinion) : <p className="text-gray-400">{language === 'ko' ? '의견 없음' : 'No opinion'}</p>}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {opinionLoading
                        ? language === 'ko'
                          ? '불러오는 중...'
                          : 'Loading...'
                        : twOpinionSavedAt
                          ? `${language === 'ko' ? '저장됨' : 'Saved'}: ${twOpinionSavedAt.slice(0, 16).replace('T', ' ')}`
                          : language === 'ko'
                            ? '아직 저장되지 않음'
                            : 'Not saved yet'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (isTwEditing) {
                          void handleSaveTwOpinion();
                          return;
                        }
                        setIsTwEditing(true);
                      }}
                      disabled={twOpinionSaving || opinionLoading}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {twOpinionSaving
                        ? language === 'ko'
                          ? '저장 중...'
                          : 'Saving...'
                        : isTwEditing
                          ? language === 'ko'
                            ? '저장'
                            : 'Save'
                          : language === 'ko'
                            ? '편집'
                            : 'Edit'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
