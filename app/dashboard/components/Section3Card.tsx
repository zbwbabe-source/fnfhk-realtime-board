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
    if (!section3Data?.season_type) return '';
    if (section3Data.season_type === 'FW') return language === 'ko' ? '(10/1~)' : '(from 10/1)';
    if (section3Data.season_type === 'SS') return language === 'ko' ? '(3/1~)' : '(from 3/1)';
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
      const sign = change > 0 ? '+' : '';
      return `${sign}${change.toFixed(1)}%p`;
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
        subClass: 'text-blue-700 bg-blue-50',
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
    <div className="bg-gradient-to-br from-orange-50 to-amber-100 rounded-lg shadow-md p-6 border-l-4 border-orange-600">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📦</span>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {t(language, 'section3Title')}
              {seasonType && <span className="ml-2 text-sm text-purple-600">({seasonType})</span>}
            </h3>
            <p className="text-xs text-gray-600">{t(language, 'section3Subtitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{currencyUnit}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">{t(language, 'filterCategory')}</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-2.5 py-1 text-xs font-medium rounded-l-lg transition-colors ${
                categoryFilter === 'clothes' ? 'bg-orange-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-r-lg transition-colors ${
                categoryFilter === 'all' ? 'bg-orange-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k1.label}</div>
          <div className="text-xl font-bold text-orange-600">{kpis.k1.value}</div>
          {kpis.k1.subValue && (
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${kpis.k1.subClass}`}>
              {kpis.k1.subValue}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-gray-600 mb-1">
            {kpis.k2.label}
            {periodStartInfo && <span className="ml-1 text-blue-600">{periodStartInfo}</span>}
          </div>
          <div className="text-xl font-bold text-gray-900">{kpis.k2.value}</div>
          {kpis.k2.subValue && (
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${kpis.k2.subClass}`}>
              {kpis.k2.subValue}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-gray-600 mb-1">
            {kpis.k3.label}
            <span className="ml-1 text-gray-500">({t(language, 'vsLastMonthEnd')})</span>
          </div>
          <div className="text-xl font-bold text-gray-900">{kpis.k3.value}</div>
          {kpis.k3.subValue && (
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${kpis.k3.subClass}`}>
              {kpis.k3.subValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
