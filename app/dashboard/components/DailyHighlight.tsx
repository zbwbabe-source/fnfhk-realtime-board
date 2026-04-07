'use client';

import { useEffect, useMemo, useState } from 'react';
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
  type StrategyRegion = 'HKMC' | 'TW';
  type StrategyRow = {
    region: StrategyRegion;
    category: string;
    status: string;
    target: string;
    execution: string;
    risk: string;
  };
  type StrategySection = 'performance' | 'risk' | 'action';
  type StrategyItem = {
    key: string;
    region: StrategyRegion;
    sectionLabel: string;
    text: string;
  };

  const [data, setData] = useState<ExecutiveInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(false);
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
    const getOldStockAgingShares = (years: any): { share2yPlus: number | null; share3yPlus: number | null } => {
      if (!Array.isArray(years) || years.length === 0) {
        return { share2yPlus: null, share3yPlus: null };
      }

      const normalized = years
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          bucket: String(row.year_bucket || '').trim(),
          amount: typeof row.curr_stock_amt === 'number' && Number.isFinite(row.curr_stock_amt) ? row.curr_stock_amt : 0,
        }));

      const total = normalized.reduce((sum, row) => sum + row.amount, 0);
      if (total <= 0) {
        return { share2yPlus: null, share3yPlus: null };
      }

      const is2yPlus = (bucket: string) =>
        bucket.includes('2') || bucket.includes('3') || bucket.toLowerCase().includes('2y') || bucket.toLowerCase().includes('3y');
      const is3yPlus = (bucket: string) => bucket.includes('3') || bucket.toLowerCase().includes('3y');

      const amount2yPlus = normalized.filter((row) => is2yPlus(row.bucket)).reduce((sum, row) => sum + row.amount, 0);
      const amount3yPlus = normalized.filter((row) => is3yPlus(row.bucket)).reduce((sum, row) => sum + row.amount, 0);

      return {
        share2yPlus: (amount2yPlus / total) * 100,
        share3yPlus: (amount3yPlus / total) * 100,
      };
    };
    const hkmcAgingShares = getOldStockAgingShares(hkmcSection3Data?.years);
    const twAgingShares = getOldStockAgingShares(twSection3Data?.years);
    const hkmc2yPlusShare =
      hkmcAgingShares.share2yPlus ?? (typeof hkmcSection3Data?.header?.old_stock_2y_plus_share === 'number' ? hkmcSection3Data.header.old_stock_2y_plus_share : null);
    const hkmc3yPlusShare =
      hkmcAgingShares.share3yPlus ?? (typeof hkmcSection3Data?.header?.old_stock_3y_plus_share === 'number' ? hkmcSection3Data.header.old_stock_3y_plus_share : null);
    const tw2yPlusShare =
      twAgingShares.share2yPlus ?? (typeof twSection3Data?.header?.old_stock_2y_plus_share === 'number' ? twSection3Data.header.old_stock_2y_plus_share : null);
    const tw3yPlusShare =
      twAgingShares.share3yPlus ?? (typeof twSection3Data?.header?.old_stock_3y_plus_share === 'number' ? twSection3Data.header.old_stock_3y_plus_share : null);

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
        oldStock2yPlusShare: hkmc2yPlusShare,
        oldStock3yPlusShare: hkmc3yPlusShare,
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
        oldStock2yPlusShare: tw2yPlusShare,
        oldStock3yPlusShare: tw3yPlusShare,
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
    const prefixMatch = line.match(/^(MTD|YTD|Total|Same-store)\s*/i);
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
        const isBalanceLine = /^Balance/i.test(trimmed);
        const isDiscountLine = /^Discount/i.test(trimmed);
        const parts = isDiscountLine
          ? line.split(/(\([+??]?\d+(?:\.\d+)?%p\)|\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0)
          : line.split(/(\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0);
        return (
          <span key={`old-v2-line-${idx}`} className="font-normal text-gray-800">
            {idx > 0 ? <br /> : null}
            {parts.map((part, partIdx) => {
              if (isDiscountLine && /^\([+??]?\d+(?:\.\d+)?%p\)$/.test(part)) {
                const raw = Number.parseFloat(part.replace(/[^\d.]/g, ''));
                const diffValue = part.includes('-') ? -raw : raw;
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
        const isBalanceLine = idx === 0 || /^Balance/i.test(trimmed);
        const isDiscountLine = idx === 3 || /^Discount/i.test(trimmed) || /%p/.test(trimmed);
        const parts = isDiscountLine
          ? line.split(/(\([^)]+%p\)|\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0)
          : line.split(/(\d+(?:\.\d+)?%)/g).filter((part) => part.length > 0);
        return (
          <span key={`old-line-${idx}`} className="font-normal text-gray-800">
            {idx > 0 ? <br /> : null}
            {parts.map((part, partIdx) => {
              if (isDiscountLine && /^\([^)]+%p\)$/.test(part)) {
                const raw = Number.parseFloat(part.replace(/[^\d.]/g, ''));
                const diffValue = part.includes('-') ? -raw : raw;
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

  const strategyRows = useMemo<StrategyRow[]>(() => {
    const source = data?.actions || [];
    return source.map((action) => {
      const rawText = String(action.text || '').trim();
      const labelMap: Record<string, keyof Pick<StrategyRow, 'status' | 'target' | 'execution' | 'risk'>> = {
        '현황': 'status',
        '진단': 'status',
        '대상': 'target',
        '실행': 'execution',
        '리스크': 'risk',
        'Status': 'status',
        'Situation': 'status',
        'Current': 'status',
        'Target': 'target',
        'Action': 'execution',
        'Risk': 'risk',
      };

      const row: StrategyRow = {
        region: action.priority,
        category: '-',
        status: '-',
        target: '-',
        execution: '-',
        risk: '-',
      };

      const sectionMatch = rawText.match(/^\[([^\]]+)\]/);
      if (sectionMatch) {
        row.category = sectionMatch[1].trim();
      }

      rawText
        .replace(/^\[[^\]]+\]\s*/, '')
        // Split only by field separators like " / ", not value slashes like "온/오프".
        .split(/\s\/\s/)
        .forEach((chunk) => {
          const trimmed = chunk.trim();
          if (!trimmed) return;
          const fieldMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
          if (!fieldMatch) {
            if (row.status === '-') row.status = trimmed;
            return;
          }
          const key = fieldMatch[1].trim();
          const value = fieldMatch[2].trim();
          const mapped = labelMap[key];
          if (mapped) row[mapped] = value;
        });

      return row;
    });
  }, [data?.actions]);

  const groupedStrategyRows = useMemo(
    () => ({
      HKMC: strategyRows.filter((row) => row.region === 'HKMC'),
      TW: strategyRows.filter((row) => row.region === 'TW'),
    }),
    [strategyRows]
  );

  const monthInfo = useMemo(() => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return {
        performanceTitle: language === 'ko' ? '당월 주요 성과' : 'Monthly Performance',
        riskTitle: language === 'ko' ? '당월 주요 이슈 & 리스크' : 'Monthly Risks',
        actionTitle: language === 'ko' ? '당월 액션플랜' : 'Action Plan',
      };
    }

    const month = parsed.getMonth() + 1;
    const monthLabel =
      language === 'ko'
        ? `${month}월`
        : parsed.toLocaleString('en-US', {
            month: 'long',
          });

    return language === 'ko'
      ? {
          performanceTitle: `${monthLabel} 주요 성과`,
          riskTitle: `${monthLabel} 주요 이슈 & 리스크`,
          actionTitle: `${monthLabel} 액션플랜`,
        }
      : {
          performanceTitle: `${monthLabel} Performance`,
          riskTitle: `${monthLabel} Risks`,
          actionTitle: `${monthLabel} Action Plan`,
        };
  }, [date, language]);

  const sectionItems = useMemo<Record<StrategySection, StrategyItem[]>>(() => {
    const items: Record<StrategySection, StrategyItem[]> = {
      performance: [],
      risk: [],
      action: [],
    };

    const normalizeCategoryLabel = (category: string) => {
      if (language === 'ko') return category;
      if (category === '매장') return 'Store';
      if (category === '당시즌') return 'In-season';
      if (category === '과시즌') return 'Old-season';
      return category;
    };

    (['HKMC', 'TW'] as const).forEach((region) => {
      groupedStrategyRows[region].forEach((row, index) => {
        const sectionLabel = normalizeCategoryLabel(row.category || '-');
        const itemKey = `${region}-${sectionLabel}-${index}`;

        if (row.status && row.status !== '-') {
          items.performance.push({
            key: `${itemKey}-performance`,
            region,
            sectionLabel,
            text: row.status,
          });
        }

        if (row.risk && row.risk !== '-') {
          items.risk.push({
            key: `${itemKey}-risk`,
            region,
            sectionLabel,
            text: row.risk,
          });
        }

        if (row.execution && row.execution !== '-') {
          const actionText =
            row.target && row.target !== '-'
              ? `${row.execution} (${language === 'ko' ? '대상' : 'Target'}: ${row.target})`
              : row.execution;

          items.action.push({
            key: `${itemKey}-action`,
            region,
            sectionLabel,
            text: actionText,
          });
        }
      });
    });

    return items;
  }, [groupedStrategyRows, language]);

  const renderStrategyList = (items: StrategyItem[]) => (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-start gap-2 text-sm leading-relaxed text-gray-800">
          <span className="mt-1 text-gray-500">•</span>
          <p>
            <span className="font-semibold text-gray-900">{item.region}</span>{' '}
            <span className="font-semibold text-gray-700">{item.sectionLabel}</span>{' '}
            {item.text}
          </p>
        </div>
      ))}
    </div>
  );

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

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{t(language, 'aiRecommendedStrategy')}</h3>
              <button
                type="button"
                onClick={() => setIsStrategyExpanded((prev) => !prev)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {isStrategyExpanded ? (language === 'ko' ? '접기' : 'Collapse') : language === 'ko' ? '펼치기' : 'Expand'}
              </button>
            </div>

            {isStrategyExpanded ? (
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                  <h4 className="text-base font-semibold text-emerald-800">{monthInfo.performanceTitle}</h4>
                  <div className="mt-3">
                    {renderStrategyList(sectionItems.performance)}
                  </div>
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
                  <h4 className="text-base font-semibold text-rose-800">{monthInfo.riskTitle}</h4>
                  <div className="mt-3">
                    {renderStrategyList(sectionItems.risk)}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                  <h4 className="text-base font-semibold text-amber-800">{monthInfo.actionTitle}</h4>
                  <div className="mt-3">
                    {renderStrategyList(sectionItems.action)}
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
