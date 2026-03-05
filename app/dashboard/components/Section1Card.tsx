'use client';

import { useMemo, useState } from 'react';
import { t, type Language } from '@/lib/translations';
import { getStoreShortCode } from '@/lib/store-name-utils';
import { getStoreArea } from '@/lib/store-area-utils';

interface Section1CardProps {
  isYtdMode: boolean;
  section1Data: any;
  language: Language;
  brand: string;
  region: string;
  date: string;
  onYtdModeToggle?: () => void;
  showSeasonCategory?: boolean;
  detailViewMode?: DetailView;
  onDetailViewModeChange?: (view: DetailView) => void;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
}

type KpiBlock = {
  label: string;
  value: string;
  discountRate?: string;
  discountDiff?: string;
};

type DetailView = 'season' | 'top5' | 'worst5';

type StoreMetricCard = {
  key: string;
  title: string;
  storeCode: string;
  fullName: string;
  area: number | null;
  sales: number;
  prevSales: number;
  yoy: number | null;
  discountRate: number | null;
  discountDiff: number | null;
};

export default function Section1Card({
  isYtdMode,
  section1Data,
  language,
  brand,
  region,
  date,
  onYtdModeToggle,
  showSeasonCategory = true,
  detailViewMode,
  onDetailViewModeChange,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
}: Section1CardProps) {
  const [detailView, setDetailView] = useState<DetailView>('season');
  const activeDetailView = detailViewMode ?? detailView;
  const setActiveDetailView = (view: DetailView) => {
    if (onDetailViewModeChange) {
      onDetailViewModeChange(view);
      return;
    }
    setDetailView(view);
  };
  const isTwRegion = region === 'TW';
  const salesLabel = isTwRegion
    ? t(language, 'actualSalesVPlus')
    : language === 'ko'
      ? '실판매출'
      : 'Actual Sales';

  const formatCurrency = (num: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? num * hkdToTwdRate : num;
    const value = Number.isFinite(converted) ? converted : 0;
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toFixed(0);
  };

  const formatRate = (rate: number | null | undefined) =>
    typeof rate === 'number' && isFinite(rate) ? `${rate.toFixed(1)}%` : '-';

  const formatPercentPointDiff = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !isFinite(value)) return '-';
    if (value > 0) return `+${value.toFixed(1)}%p`;
    if (value < 0) return `\u25B3${Math.abs(value).toFixed(1)}%p`;
    return '0.0%p';
  };

  const emptyKpis = {
    k1: {
      label: salesLabel,
      value: '-',
      discountRate: '-',
      discountDiff: '-',
    } as KpiBlock,
    k2: { label: t(language, 'yoy'), value: '-' } as KpiBlock,
    k3: { label: t(language, 'progress'), value: '-' } as KpiBlock,
  };

  const calculateKPIs = () => {
    if (!section1Data?.total_subtotal) return emptyKpis;

    const total = section1Data.total_subtotal;
    if (isYtdMode) {
      if (typeof total.ytd_act === 'undefined' || total.ytd_act === null) return emptyKpis;
    } else {
      if (typeof total.mtd_act === 'undefined' || total.mtd_act === null) return emptyKpis;
    }

    const actual = isYtdMode ? total.ytd_act : total.mtd_act;
    const compareRate = isYtdMode ? total.yoy_ytd : total.yoy;
    const progress = isYtdMode ? total.progress_ytd : total.progress;
    const discountRate = isYtdMode ? total.discount_rate_ytd : total.discount_rate_mtd;
    const discountRateDiff = isYtdMode ? total.discount_rate_ytd_diff : total.discount_rate_mtd_diff;

    const hasCompareRate = typeof compareRate === 'number' && isFinite(compareRate);
    const hasDiscountRate = typeof discountRate === 'number' && !isNaN(discountRate);

    return {
      k1: {
        label: salesLabel,
        value: formatCurrency(actual),
        discountRate: hasDiscountRate ? formatRate(discountRate) : '-',
        discountDiff: formatPercentPointDiff(discountRateDiff),
        rawDiscountDiff: typeof discountRateDiff === 'number' && isFinite(discountRateDiff) ? discountRateDiff : null,
      } as KpiBlock & { rawDiscountDiff: number | null },
      k2: {
        label: t(language, 'yoy'),
        value: hasCompareRate ? `${compareRate.toFixed(0)}%` : '-',
        rawValue: hasCompareRate ? compareRate : null,
      } as KpiBlock & { rawValue: number | null },
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
        rawValue: typeof progress === 'number' && isFinite(progress) ? progress : null,
      } as KpiBlock & { rawValue: number | null },
    };
  };

  const kpis = calculateKPIs();
  
  const getYoyColor = (yoy: number | null) => {
    if (yoy === null) return 'text-gray-600 bg-gray-100';
    if (yoy >= 100) return 'text-green-700 bg-green-50 border-green-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getDiscountDiffColor = (diff: number | null) => {
    if (diff === null) return 'text-gray-600';
    if (diff > 0) return 'text-red-600';
    if (diff < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const currencyUnit =
    region === 'TW'
      ? language === 'ko'
        ? `단위: ${currencyCode}`
        : `Unit: ${currencyCode}`
      : t(language, 'cardUnit');
  const seasonCategorySales = section1Data?.season_category_sales;
  const seasonLabels = seasonCategorySales?.season_labels || {};

  const storeMetricCards = useMemo<StoreMetricCard[]>(() => {
    if (!section1Data || typeof section1Data !== 'object') return [];

    const rawStores = Object.entries(section1Data)
      .filter(([key, value]) => Array.isArray(value) && !key.endsWith('_subtotal'))
      .flatMap(([, value]) => value as any[])
      .filter((store) => store && typeof store === 'object')
      .filter((store) => (store.channel || '') !== '온라인');

    const dedupedByCode = new Map<string, any>();
    rawStores.forEach((store) => {
      const code = String(store.shop_cd || store.shop_name || '');
      if (!code) return;
      if (!dedupedByCode.has(code)) dedupedByCode.set(code, store);
    });

    const cards = [...dedupedByCode.values()].map((store) => {
      const sales = isYtdMode ? Number(store.ytd_act || 0) : Number(store.mtd_act || 0);
      const prevSales = isYtdMode ? Number(store.ytd_act_py || 0) : Number(store.mtd_act_py || 0);
      const yoyRaw = isYtdMode ? store.yoy_ytd : store.yoy;
      const discountRateRaw = isYtdMode ? store.discount_rate_ytd : store.discount_rate_mtd;
      const discountDiffRaw = isYtdMode ? store.discount_rate_ytd_diff : store.discount_rate_mtd_diff;
      
      const storeCode = String(store.shop_cd || '');
      const fullName = String(store.shop_name || store.shop_cd || '-');
      const asofDate = date ? new Date(date) : undefined;
      const area = storeCode ? getStoreArea(storeCode, asofDate) : null;

      return {
        key: String(store.shop_cd || store.shop_name || ''),
        title: String(store.shop_name || store.shop_cd || '-'),
        storeCode,
        fullName,
        area,
        sales,
        prevSales,
        yoy: typeof yoyRaw === 'number' && isFinite(yoyRaw) ? yoyRaw : null,
        discountRate: typeof discountRateRaw === 'number' && isFinite(discountRateRaw) ? discountRateRaw : null,
        discountDiff: typeof discountDiffRaw === 'number' && isFinite(discountDiffRaw) ? discountDiffRaw : null,
      };
    });

    cards.sort((a, b) => b.sales - a.sales);
    return cards;
  }, [section1Data, isYtdMode]);

  const top5StoreCards = storeMetricCards.slice(0, 5);
  const worst5StoreCards = storeMetricCards
    .filter((item) => {
      const isClosed = item.prevSales > 0 && item.sales <= 0;
      return item.sales > 0 && !isClosed;
    })
    .slice(-5)
    .sort((a, b) => b.sales - a.sales);

  const hasNextSeasonSales = showSeasonCategory && seasonCategorySales?.metrics
    ? (() => {
        const nextMetric = seasonCategorySales.metrics.nextSeason;
        const nextSales = isYtdMode ? nextMetric?.ytd_act : nextMetric?.mtd_act;
        return typeof nextSales === 'number' && nextSales > 0;
      })()
    : false;

  const detailMetrics = showSeasonCategory && seasonCategorySales?.metrics
    ? [
        { key: 'currentSeason', title: `${t(language, 'currentSeason')}(${seasonLabels.current || '-'})`, apparelOnly: true },
        ...(hasNextSeasonSales
          ? [{ key: 'nextSeason', title: `${t(language, 'nextSeason')}(${seasonLabels.next || '-'})`, apparelOnly: true } as const]
          : []),
        { key: 'pastSeason', title: `${t(language, 'pastSeason')}(${seasonLabels.past || '-'})`, apparelOnly: true },
        { key: 'hat', title: t(language, 'hat') },
        { key: 'shoes', title: t(language, 'shoes') },
        ...(!hasNextSeasonSales ? [{ key: 'bag', title: t(language, 'bag') } as const] : []),
      ]
    : [];

  const detailCards =
    activeDetailView === 'season'
      ? detailMetrics.map((item) => {
          const metric = seasonCategorySales.metrics[item.key];
          return {
            key: String(item.key),
            title: item.title,
            apparelOnly: item.apparelOnly,
            sales: isYtdMode ? metric?.ytd_act : metric?.mtd_act,
            yoy: isYtdMode ? metric?.ytd_yoy : metric?.mtd_yoy,
            discountRate: isYtdMode ? metric?.ytd_discount_rate : metric?.mtd_discount_rate,
            discountDiff: isYtdMode ? metric?.ytd_discount_rate_diff : metric?.mtd_discount_rate_diff,
          };
        })
      : (activeDetailView === 'top5' ? top5StoreCards : worst5StoreCards).map((item) => ({
          ...item,
          apparelOnly: false,
        }));

  return (
    <article className="rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h3 className="leading-tight text-base font-semibold text-gray-900">{t(language, 'section1Title')}</h3>
            {onYtdModeToggle && (
              <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-2.5 py-1.5 sm:px-3">
                <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs font-medium text-purple-900 sm:text-sm">
                  {isYtdMode
                    ? `${date.slice(0, 4)}/01/01~${date.slice(5).replace('-', '/')}`
                    : `${date.slice(0, 4)}/${date.slice(5, 7)}/01~${date.slice(5).replace('-', '/')}`}
                </p>
              </div>
            )}
            {showSeasonCategory && (
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setActiveDetailView('season')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    activeDetailView === 'season' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? '시즌' : 'Season'}
                </button>
                <button
                  onClick={() => setActiveDetailView('top5')}
                  className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    activeDetailView === 'top5' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? (
                    <span className="inline-block leading-tight">상위<br />매장</span>
                  ) : (
                    'Top'
                  )}
                </button>
                <button
                  onClick={() => setActiveDetailView('worst5')}
                  className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    activeDetailView === 'worst5' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? (
                    <span className="inline-block leading-tight">하위<br />매장</span>
                  ) : (
                    'Bottom'
                  )}
                </button>
              </div>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section1Subtitle')}</p>
        </div>

        {onYtdModeToggle && (
          <div className="w-full shrink-0 sm:w-auto">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => {
                  if (isYtdMode) onYtdModeToggle();
                }}
                className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  !isYtdMode ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'mtdToggle')}
              </button>
              <button
                onClick={() => {
                  if (!isYtdMode) onYtdModeToggle();
                }}
                className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  isYtdMode ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'ytdToggle')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="min-w-0 space-y-1 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 p-2.5 sm:p-3">
          <p className="text-xs font-medium text-gray-600">{kpis.k1.label}</p>
          <p className={`${showSeasonCategory ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-bold leading-tight tabular-nums text-gray-900`}>{kpis.k1.value}</p>
          <p className="text-xs tabular-nums">
            <span className="text-gray-600">{t(language, 'discountRateLabel')} {kpis.k1.discountRate}</span>{' '}
            <span className={`font-semibold ${getDiscountDiffColor((kpis.k1 as any).rawDiscountDiff)}`}>
              ({kpis.k1.discountDiff})
            </span>
          </p>
        </div>
        <div className="min-w-0 space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2.5 sm:p-3">
          <p className="text-xs text-gray-500">{kpis.k2.label}</p>
          <p className="text-xl font-bold tabular-nums text-gray-900 sm:text-2xl">{kpis.k2.value}</p>
          <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${getYoyColor((kpis.k2 as any).rawValue)}`}>
            {(kpis.k2 as any).rawValue !== null 
              ? ((kpis.k2 as any).rawValue >= 100 ? '↗ 성장' : '↘ 감소')
              : '-'}
          </span>
        </div>
        <div className="min-w-0 space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2.5 sm:p-3">
          <div className="group relative inline-block">
            <p
              className="cursor-help text-xs text-gray-500 underline decoration-dotted underline-offset-2"
              title={t(language, 'progressVsApproved')}
            >
              {kpis.k3.label}
            </p>
            <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max rounded bg-gray-900 px-2 py-1 text-[10px] text-white shadow-md group-hover:block">
              {t(language, 'progressVsApproved')}
            </div>
          </div>
          <p className="text-xl font-bold tabular-nums text-gray-900 sm:text-2xl">{kpis.k3.value}</p>
        </div>
      </div>

      {detailCards.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {detailCards.map((item) => {
              const yoyColor = item.yoy !== null && typeof item.yoy === 'number' && isFinite(item.yoy)
                ? (item.yoy >= 100 ? 'text-green-700' : 'text-red-700')
                : 'text-gray-700';
              const discountDiffColor = item.discountDiff !== null && typeof item.discountDiff === 'number' && isFinite(item.discountDiff)
                ? (item.discountDiff > 0 ? 'text-red-600' : item.discountDiff < 0 ? 'text-green-600' : 'text-gray-600')
                : 'text-gray-600';
              
              // 매장 카드인지 시즌 카드인지 확인
              const isStoreCard = activeDetailView !== 'season';
              const storeFullName = isStoreCard ? String((item as any).fullName || item.title) : '';
              const shortCode = isStoreCard ? getStoreShortCode(storeFullName) : null;
              const storeArea = isStoreCard ? ((item as any).area as number | null | undefined) ?? null : null;
              
              return (
                <div key={item.key} className="rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 shadow-sm">
                  {item.apparelOnly ? (
                    <div className="group relative block min-h-[36px]">
                      <p className="cursor-help break-keep text-sm font-bold leading-snug text-gray-800 underline decoration-dotted underline-offset-2">
                        {item.title}
                      </p>
                      <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-md group-hover:block">
                        {t(language, 'apparelOnly')}
                      </div>
                    </div>
                  ) : isStoreCard ? (
                    <div className="group relative block min-h-[36px]">
                      <p className="cursor-help break-keep text-sm font-bold leading-snug text-gray-800">
                        {shortCode || item.title}
                      </p>
                      <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max rounded bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                        <p className="font-semibold">{storeFullName || item.title}</p>
                        <p className="mt-1 text-gray-300">
                          {storeArea !== null ? `${storeArea}평` : language === 'ko' ? '면적 정보 없음' : 'No area data'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="min-h-[36px] break-keep text-sm font-bold leading-snug text-gray-800">{item.title}</p>
                  )}
                  <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{formatCurrency(item.sales || 0)}</p>
                  <p className={`mt-0.5 text-xs font-semibold tabular-nums ${yoyColor}`}>
                      {typeof item.yoy === 'number' && isFinite(item.yoy) ? `YoY ${item.yoy.toFixed(0)}%` : '-'}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums">
                    <span className="text-gray-600">{t(language, 'discountRateLabel')} {formatRate(item.discountRate)}</span>{' '}
                    <span className={`font-semibold ${discountDiffColor}`}>
                      ({formatPercentPointDiff(item.discountDiff)})
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-2 text-[11px] text-gray-500">{currencyUnit}</div>
    </article>
  );
}
