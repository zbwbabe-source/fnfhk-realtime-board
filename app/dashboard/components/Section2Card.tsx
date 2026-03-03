'use client';

import { useMemo, useState } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section2CardProps {
  section2Data: any;
  language: Language;
  categoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  region: string;
  compactMainMetric?: boolean;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
  showCategoryRanking?: boolean;
}

export default function Section2Card({
  section2Data,
  language,
  categoryFilter,
  onCategoryFilterChange,
  region,
  compactMainMetric = false,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
  showCategoryRanking = false,
}: Section2CardProps) {
  type CategoryRankingCard = {
    key: string;
    category: string;
    salesTag: number;
    mtdSalesTag: number;
    sellthroughPct: number;
    salesYoyPct: number | null;
    mtdSalesYoyPct: number | null;
    discountRate: number | null;
    discountRateDiff: number | null;
    mtdDiscountRate: number | null;
    mtdDiscountRateDiff: number | null;
  };

  const [rankingView, setRankingView] = useState<'top5' | 'worst5'>('top5');
  const [periodView, setPeriodView] = useState<'cum' | 'mtd'>('mtd');

  const formatCurrency = (num: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? num * hkdToTwdRate : num;
    if (converted >= 1000000) return (converted / 1000000).toFixed(1) + 'M';
    if (converted >= 1000) return (converted / 1000).toFixed(1) + 'K';
    return converted.toFixed(0);
  };

  const season = section2Data?.header?.sesn || '';
  const currencyUnit =
    region === 'TW'
      ? language === 'ko'
        ? `단위: ${currencyCode}`
        : `Unit: ${currencyCode}`
      : t(language, 'cardUnit');

  const header = section2Data?.header;
  const sellthrough = header?.overall_sellthrough ?? 0;
  const totalSales = header?.total_sales ?? 0;
  const totalInbound = header?.total_inbound ?? 0;
  const sellthroughYoyPp = header?.sellthrough_yoy_pp as number | null | undefined;
  const salesYoyPct = header?.sales_yoy_pct as number | null | undefined;
  const inboundYoyPct = header?.inbound_yoy_pct as number | null | undefined;

  const formatPp = (v: number | null | undefined) => {
    if (v === null || v === undefined) return 'N/A';
    if (v > 0) {
      return `+${v.toFixed(1)}%p`;
    }
    if (v < 0) {
      return `${v.toFixed(1)}%p`;
    }
    return '0.0%p';
  };

  const formatYoy = (v: number | null | undefined) => {
    if (v === null || v === undefined) return 'YoY N/A';
    return `YoY ${v.toFixed(0)}%`;
  };

  const metricTone = (v: number | null | undefined, pivot = 0) => {
    if (v === null || v === undefined) return 'text-gray-600 bg-gray-100';
    if (v > pivot) return 'text-green-700 bg-green-50';
    if (v < pivot) return 'text-red-700 bg-red-50';
    return 'text-gray-700 bg-gray-100';
  };

  const categoryRankingCards = useMemo(() => {
    const categories = Array.isArray(section2Data?.categories) ? section2Data.categories : [];
    const getAmount = (item: CategoryRankingCard) => (periodView === 'cum' ? item.salesTag : item.mtdSalesTag);
    const normalized: CategoryRankingCard[] = categories
      .map((item: any, idx: number) => ({
        key: `${String(item?.category ?? 'UNK')}-${idx}`,
        category: String(item?.category ?? 'UNK').slice(0, 2),
        salesTag: Number(item?.sales_tag ?? 0),
        mtdSalesTag: Number(item?.mtd_sales_tag ?? 0),
        sellthroughPct: Number(item?.sellthrough ?? 0),
        salesYoyPct: item?.sales_yoy_pct === null || item?.sales_yoy_pct === undefined ? null : Number(item.sales_yoy_pct),
        mtdSalesYoyPct:
          item?.mtd_sales_yoy_pct === null || item?.mtd_sales_yoy_pct === undefined ? null : Number(item.mtd_sales_yoy_pct),
        discountRate: item?.discount_rate === null || item?.discount_rate === undefined ? null : Number(item.discount_rate),
        discountRateDiff:
          item?.discount_rate_diff === null || item?.discount_rate_diff === undefined
            ? null
            : Number(item.discount_rate_diff),
        mtdDiscountRate:
          item?.mtd_discount_rate === null || item?.mtd_discount_rate === undefined ? null : Number(item.mtd_discount_rate),
        mtdDiscountRateDiff:
          item?.mtd_discount_rate_diff === null || item?.mtd_discount_rate_diff === undefined
            ? null
            : Number(item.mtd_discount_rate_diff),
      }))
      .filter((item: CategoryRankingCard) => Number.isFinite(getAmount(item)) && getAmount(item) > 0);

    if (normalized.length === 0) return [];

    const sortedBySales = [...normalized].sort((a, b) => getAmount(b) - getAmount(a));
    const top5 = sortedBySales.slice(0, 5);
    const worst5 = [...sortedBySales]
      .slice(-5)
      .sort((a, b) => getAmount(b) - getAmount(a));

    return rankingView === 'top5' ? top5 : worst5;
  }, [section2Data, rankingView, periodView]);

  const periodLabel = useMemo(() => {
    const asof = String(section2Data?.asof_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asof)) return '';
    const asofLabel = `${asof.slice(0, 4)}/${asof.slice(5, 7)}/${asof.slice(8, 10)}`;
    if (periodView === 'cum') {
      const cumStart = String(section2Data?.cum_start_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cumStart)) return asofLabel;
      const cumStartLabel = `${cumStart.slice(0, 4)}/${cumStart.slice(5, 7)}/${cumStart.slice(8, 10)}`;
      return `${cumStartLabel}~${asofLabel}`;
    }
    return `${asof.slice(0, 4)}/${asof.slice(5, 7)}/01~${asofLabel}`;
  }, [section2Data, periodView]);

  return (
    <article className="rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 leading-tight">
            {categoryFilter === 'clothes' ? t(language, 'section2HeaderClothes') : t(language, 'section2HeaderAll')}
            {season && <span className="ml-2 text-xs font-medium text-gray-500">({season})</span>}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section2Subtitle')}</p>
        </div>

        <div className="w-full shrink-0 space-y-1.5 text-left sm:w-auto sm:text-right">
          <p className="text-xs text-gray-500 sm:text-right">{t(language, 'filterCategory')}</p>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                categoryFilter === 'clothes' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                categoryFilter === 'all' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="min-w-0 space-y-2 rounded-xl border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50 p-2.5 sm:p-3">
          <p className="text-xs font-medium text-gray-600">{t(language, 'sellRate')}</p>
          <p className={`${compactMainMetric ? 'text-xl sm:text-2xl' : 'text-[2rem] sm:text-4xl'} font-bold leading-tight tabular-nums text-gray-900`}>{sellthrough.toFixed(1)}%</p>
          <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${metricTone(sellthroughYoyPp, 0)}`}>
            {formatPp(sellthroughYoyPp)}
          </span>
        </div>

        <div className="min-w-0 space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2.5 sm:p-3">
          <p className="text-xs text-gray-500">{t(language, 'cumulativeSales')}</p>
          <p className="text-lg font-bold tabular-nums text-gray-900 sm:text-xl">{formatCurrency(totalSales)}</p>
          <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${metricTone(salesYoyPct, 100)}`}>
            {formatYoy(salesYoyPct)}
          </span>
        </div>

        <div className="min-w-0 space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2.5 sm:p-3">
          <p className="text-xs text-gray-500">{t(language, 'cumulativeInbound')}</p>
          <p className="text-lg font-bold tabular-nums text-gray-900 sm:text-xl">{formatCurrency(totalInbound)}</p>
          <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${metricTone(inboundYoyPct, 100)}`}>
            {formatYoy(inboundYoyPct)}
          </span>
        </div>
      </div>

      {showCategoryRanking && categoryRankingCards.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-gray-600">
                {language === 'ko'
                  ? `당시즌${season ? `(${season}) ` : ' '}카테고리별 택매출`
                  : `${season ? `In-season (${season}) ` : 'In-season '}Tag Sales by Category`}
              </p>
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setPeriodView('mtd')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    periodView === 'mtd' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? '당월' : 'MTD'}
                </button>
                <button
                  onClick={() => setPeriodView('cum')}
                  className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    periodView === 'cum' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? '누적' : 'Cum'}
                </button>
              </div>
              {periodLabel && <p className="text-[11px] text-gray-500">{periodLabel}</p>}
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setRankingView('top5')}
                className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  rankingView === 'top5' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {language === 'ko' ? '상위' : 'Top'}
              </button>
              <button
                onClick={() => setRankingView('worst5')}
                className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  rankingView === 'worst5' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {language === 'ko' ? '하위' : 'Bottom'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {categoryRankingCards.map((item, idx) => (
              <div key={item.key} className="rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 shadow-sm">
                <p className="min-h-[36px] break-keep text-sm font-bold leading-snug text-gray-800">{`${idx + 1}. ${item.category}`}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
                  {formatCurrency(periodView === 'cum' ? item.salesTag : item.mtdSalesTag)}
                </p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-700">
                  {language === 'ko' ? '판매율' : 'Sell-through'} {item.sellthroughPct.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-700">
                  {language === 'ko' ? (periodView === 'mtd' ? '당월YOY ' : '누적YOY ') : 'YoY '}
                  {(periodView === 'cum' ? item.salesYoyPct : item.mtdSalesYoyPct) !== null &&
                  Number.isFinite(periodView === 'cum' ? item.salesYoyPct : item.mtdSalesYoyPct)
                    ? `${(periodView === 'cum' ? item.salesYoyPct : item.mtdSalesYoyPct)!.toFixed(0)}%`
                    : '-'}
                </p>
                <p className="mt-0.5 text-xs tabular-nums">
                  <span className="text-gray-600">
                    {language === 'ko' ? '할인율' : 'Discount'}{' '}
                    {(periodView === 'cum' ? item.discountRate : item.mtdDiscountRate) !== null &&
                    Number.isFinite(periodView === 'cum' ? item.discountRate : item.mtdDiscountRate)
                      ? `${(periodView === 'cum' ? item.discountRate : item.mtdDiscountRate)!.toFixed(1)}%`
                      : '-'}
                  </span>{' '}
                  <span
                    className={`font-semibold ${
                      (periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff) === null ||
                      !Number.isFinite(periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)
                        ? 'text-gray-600'
                        : (periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)! > 0
                          ? 'text-red-600'
                          : (periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)! < 0
                            ? 'text-green-600'
                            : 'text-gray-600'
                    }`}
                  >
                    (
                    {(periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff) === null ||
                    !Number.isFinite(periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)
                      ? '-'
                      : (periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)! > 0
                        ? `+${(periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)!.toFixed(1)}%p`
                        : (periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)! < 0
                          ? `\u25B3${Math.abs((periodView === 'cum' ? item.discountRateDiff : item.mtdDiscountRateDiff)!).toFixed(1)}%p`
                          : '0.0%p'}
                    )
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        {currencyUnit} | {t(language, 'tagBasis')}
      </div>
    </article>
  );
}
