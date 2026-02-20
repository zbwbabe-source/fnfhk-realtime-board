'use client';

import { t, type Language } from '@/lib/translations';

interface Section1CardProps {
  isYtdMode: boolean;
  section1Data: any;
  language: Language;
  brand: string;
  region: string;
  date: string;
  onYtdModeToggle?: () => void;
}

type KpiBlock = {
  label: string;
  value: string;
  discountRate?: string;
  discountDiff?: string;
};

export default function Section1Card({
  isYtdMode,
  section1Data,
  language,
  brand,
  region,
  date,
  onYtdModeToggle,
}: Section1CardProps) {
  const isTwRegion = region === 'TW';
  const salesLabel = isTwRegion
    ? language === 'ko'
      ? '실판매출 (V+)'
      : 'Actual Sales (V+)'
    : t(language, isYtdMode ? 'ytdActual' : 'monthlyActual');

  const formatCurrency = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  const formatRate = (rate: number | null | undefined) =>
    typeof rate === 'number' && isFinite(rate) ? `${rate.toFixed(1)}%` : 'N/A';

  const formatPercentPointDiff = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !isFinite(value)) return 'N/A';
    if (value > 0) return `+${value.toFixed(1)}%p`;
    if (value < 0) return `\u25B3${Math.abs(value).toFixed(1)}%p`;
    return '0.0%p';
  };

  const emptyKpis = {
    k1: {
      label: salesLabel,
      value: 'N/A',
      discountRate: 'N/A',
      discountDiff: 'N/A',
    } as KpiBlock,
    k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' } as KpiBlock,
    k3: { label: t(language, 'progress'), value: 'N/A' } as KpiBlock,
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
    const compareRate =
      brand === 'X' ? (isYtdMode ? total.yoy_ytd : total.mom) : isYtdMode ? total.yoy_ytd : total.yoy;
    const progress = isYtdMode ? total.progress_ytd : total.progress;
    const discountRate = isYtdMode ? total.discount_rate_ytd : total.discount_rate_mtd;
    const discountRateDiff = isYtdMode ? total.discount_rate_ytd_diff : total.discount_rate_mtd_diff;

    const hasCompareRate = compareRate && compareRate !== 0;
    const hasDiscountRate = typeof discountRate === 'number' && !isNaN(discountRate);

    return {
      k1: {
        label: salesLabel,
        value: formatCurrency(actual),
        discountRate: hasDiscountRate ? formatRate(discountRate) : 'N/A',
        discountDiff: formatPercentPointDiff(discountRateDiff),
      } as KpiBlock,
      k2: {
        label: hasCompareRate ? t(language, brand === 'X' ? 'mom' : 'yoy') : 'Discount Rate',
        value: hasCompareRate ? `${compareRate.toFixed(0)}%` : hasDiscountRate ? `${discountRate.toFixed(1)}%` : 'N/A',
      } as KpiBlock,
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
      } as KpiBlock,
    };
  };

  const kpis = calculateKPIs();
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');
  const seasonCategorySales = section1Data?.season_category_sales;
  const seasonLabels = seasonCategorySales?.season_labels || {};
  const detailMetrics = seasonCategorySales?.metrics
    ? [
        { key: 'currentSeason', title: `당시즌(${seasonLabels.current || '-'})` },
        { key: 'nextSeason', title: `차시즌(${seasonLabels.next || '-'})` },
        { key: 'pastSeason', title: `과시즌(${seasonLabels.past || '-'})` },
        { key: 'hat', title: '모자' },
        { key: 'shoes', title: '신발' },
      ]
    : [];

  return (
    <article className="rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="leading-tight text-base font-semibold text-gray-900">{t(language, 'section1Title')}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section1Subtitle')}</p>
        </div>

        {onYtdModeToggle && (
          <div className="shrink-0 space-y-1.5 text-right">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => {
                  if (isYtdMode) onYtdModeToggle();
                }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  !isYtdMode ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'mtdToggle')}
              </button>
              <button
                onClick={() => {
                  if (!isYtdMode) onYtdModeToggle();
                }}
                className={`border-l border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors ${
                  isYtdMode ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'ytdToggle')}
              </button>
            </div>
            <p className="text-[10px] leading-tight text-gray-500">
              {isYtdMode
                ? `${date.slice(0, 4)}/01/01~${date.slice(5).replace('-', '/')}`
                : `${date.slice(0, 4)}/${date.slice(5, 7)}/01~${date.slice(5).replace('-', '/')}`}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">{kpis.k1.label}</p>
          <p className="text-3xl font-semibold tabular-nums text-gray-900">{kpis.k1.value}</p>
          <p className="text-[11px] tabular-nums text-gray-600">
            {language === 'ko' ? '할인율' : 'Discount Rate'} {kpis.k1.discountRate} ({kpis.k1.discountDiff})
          </p>
        </div>
        <div className="space-y-2 border-l border-gray-100 pl-3">
          <p className="text-xs text-gray-500">{kpis.k2.label}</p>
          <p className="text-base font-semibold tabular-nums text-gray-900">{kpis.k2.value}</p>
        </div>
        <div className="space-y-2 border-l border-gray-100 pl-3">
          <p className="text-xs text-gray-500">{kpis.k3.label}</p>
          <p className="text-base font-semibold tabular-nums text-gray-900">{kpis.k3.value}</p>
        </div>
      </div>

      {detailMetrics.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {detailMetrics.map((item) => {
              const metric = seasonCategorySales.metrics[item.key];
              const sales = isYtdMode ? metric?.ytd_act : metric?.mtd_act;
              const yoy = isYtdMode ? metric?.ytd_yoy : metric?.mtd_yoy;
              const discountRate = isYtdMode ? metric?.ytd_discount_rate : metric?.mtd_discount_rate;
              const discountDiff = isYtdMode ? metric?.ytd_discount_rate_diff : metric?.mtd_discount_rate_diff;
              return (
                <div key={item.key} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                  <p className="text-[11px] font-medium text-gray-600">{item.title}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-gray-900">{formatCurrency(sales || 0)}</p>
                  <p className="text-[10px] text-gray-500">{isTwRegion ? '실판매출(V+)' : '실판매출'}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-gray-600">
                    YoY {typeof yoy === 'number' && isFinite(yoy) ? `${yoy.toFixed(0)}%` : 'N/A'}
                  </p>
                  <p className="text-[11px] tabular-nums text-gray-600">
                    {language === 'ko' ? '할인율' : 'Discount Rate'} {formatRate(discountRate)} ({formatPercentPointDiff(discountDiff)})
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
