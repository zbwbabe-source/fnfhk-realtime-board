'use client';

import { t, type Language } from '@/lib/translations';

interface Section3CardProps {
  section3Data: any;
  language: Language;
  region: string;
  categoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
}

export default function Section3Card({
  section3Data,
  language,
  region,
  categoryFilter,
  onCategoryFilterChange,
}: Section3CardProps) {
  const formatCurrency = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  const getSection3SeasonType = () => {
    if (!section3Data?.season_type) return '';
    return `${section3Data.season_type} ${t(language, 'oldSeason')}`;
  };

  const getPeriodStartInfo = () => {
    if (section3Data?.period_start_date) {
      const periodStart = section3Data.period_start_date;
      const year = periodStart.slice(2, 4);
      const month = periodStart.slice(5, 7);
      const day = periodStart.slice(8, 10);

      return language === 'ko'
        ? `(${year}/${parseInt(month)}/${parseInt(day)}~)`
        : `(from ${year}/${parseInt(month)}/${parseInt(day)})`;
    }

    if (!section3Data?.season_type) return '';

    const currentYear = new Date().getFullYear();
    const shortYear = String(currentYear).slice(-2);

    if (section3Data.season_type === 'FW') {
      return language === 'ko' ? `(${shortYear}/9/1~)` : `(from ${shortYear}/9/1)`;
    }
    if (section3Data.season_type === 'SS') {
      return language === 'ko' ? `(${shortYear}/3/1~)` : `(from ${shortYear}/3/1)`;
    }
    return '';
  };

  const metricTone = (v: number, pivot = 0) => {
    if (v > pivot) return 'text-red-700 bg-red-50';
    if (v < pivot) return 'text-green-700 bg-green-50';
    return 'text-gray-700 bg-gray-100';
  };

  const calculateKPIs = () => {
    if (!section3Data?.header) {
      return {
        k1: { label: t(language, 'currentStock'), value: 'N/A', subValue: null, subClass: '' },
        k2: { label: t(language, 'depletedStock'), value: 'N/A', subValue: null, subClass: '' },
        k3: { label: t(language, 'stagnantRatio'), value: 'N/A', subValue: null, subClass: '' },
      };
    }

    const header = section3Data.header;
    const currentStock = header.curr_stock_amt || 0;
    const currentStockYoyPct = header.curr_stock_yoy_pct as number | null | undefined;
    const depletedStock = header.depleted_stock_amt || 0;
    const currentMonthDepleted = header.current_month_depleted || 0;
    const stagnantStock = header.stagnant_stock_amt || 0;
    const stagnantRatio = currentStock > 0 ? (stagnantStock / currentStock) * 100 : 0;
    const prevMonthStagnantRatio = (header.prev_month_stagnant_ratio || 0) * 100;
    const stagnantRatioChange = stagnantRatio - prevMonthStagnantRatio;

    const formatSubValue = (change: number) => {
      if (change > 0) return `+${change.toFixed(1)}%p`;
      if (change < 0) return `-${Math.abs(change).toFixed(1)}%p`;
      return '0.0%p';
    };

    return {
      k1: {
        label: t(language, 'currentStock'),
        value: formatCurrency(currentStock),
        subValue:
          currentStockYoyPct !== null && currentStockYoyPct !== undefined
            ? `YoY ${currentStockYoyPct.toFixed(0)}%`
            : 'YoY 0%',
        subClass:
          currentStockYoyPct !== null && currentStockYoyPct !== undefined
            ? metricTone(currentStockYoyPct, 100)
            : 'text-gray-700 bg-gray-100',
      },
      k2: {
        label: t(language, 'depletedStock'),
        value: formatCurrency(depletedStock),
        subValue:
          currentMonthDepleted > 0
            ? `${t(language, 'currentMonthOnly')} ${formatCurrency(currentMonthDepleted)}`
            : null,
        subClass: 'text-orange-700 bg-orange-50',
      },
      k3: {
        label: t(language, 'stagnantRatio'),
        value: `${stagnantRatio.toFixed(1)}%`,
        subValue: stagnantRatioChange !== 0 ? formatSubValue(stagnantRatioChange) : null,
        subClass: metricTone(stagnantRatioChange, 0),
      },
    };
  };

  const kpis = calculateKPIs();
  const seasonType = getSection3SeasonType();
  const periodStartInfo = getPeriodStartInfo();
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');

  return (
    <article className="rounded-2xl border border-gray-200 border-l-4 border-l-orange-400 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 leading-tight">
            {t(language, 'section3Title')}
            {seasonType && <span className="ml-2 text-xs font-medium text-gray-500">({seasonType})</span>}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section3Subtitle')}</p>
        </div>

        <div className="shrink-0 space-y-1.5 text-right">
          <p className="text-xs font-medium text-gray-500">{t(language, 'filterCategory')}</p>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === 'clothes' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`border-l border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === 'all' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpis.k1.label}</p>
          <p className="text-3xl font-bold tabular-nums text-gray-900 leading-none">{kpis.k1.value}</p>
          {kpis.k1.subValue && (
            <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${kpis.k1.subClass}`}>
              {kpis.k1.subValue}
            </span>
          )}
        </div>

        <div className="space-y-2 border-l border-gray-200 pl-6">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpis.k2.label}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">{kpis.k2.value}</p>
          {kpis.k2.subValue && (
            <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${kpis.k2.subClass}`}>
              {kpis.k2.subValue}
            </span>
          )}
          {periodStartInfo && <p className="mt-1 text-[10px] leading-tight text-gray-500">{periodStartInfo}</p>}
        </div>

        <div className="space-y-2 border-l border-gray-200 pl-6">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpis.k3.label}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">{kpis.k3.value}</p>
          {kpis.k3.subValue && (
            <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${kpis.k3.subClass}`}>
              {kpis.k3.subValue}
            </span>
          )}
          <p className="mt-1 text-[10px] leading-tight text-gray-500">({t(language, 'vsLastMonthEnd')})</p>
        </div>
      </div>

      <div className="mt-5 border-t border-gray-200 pt-3 text-[10px] uppercase tracking-wide text-gray-400">{currencyUnit}</div>
    </article>
  );
}
