'use client';

import { t, type Language } from '@/lib/translations';

interface Section2CardProps {
  section2Data: any;
  language: Language;
  categoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  region: string;
}

export default function Section2Card({
  section2Data,
  language,
  categoryFilter,
  onCategoryFilterChange,
  region,
}: Section2CardProps) {
  const formatCurrency = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  const season = section2Data?.header?.sesn || '';
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');

  const header = section2Data?.header;
  const sellthrough = header?.overall_sellthrough ?? 0;
  const totalSales = header?.total_sales ?? 0;
  const totalInbound = header?.total_inbound ?? 0;
  const sellthroughYoyPp = header?.sellthrough_yoy_pp as number | null | undefined;
  const salesYoyPct = header?.sales_yoy_pct as number | null | undefined;
  const inboundYoyPct = header?.inbound_yoy_pct as number | null | undefined;

  const formatPp = (v: number | null | undefined) => {
    if (v === null || v === undefined) return language === 'ko' ? '전년비 N/A' : 'vs LY N/A';
    const sign = v > 0 ? '+' : '';
    return language === 'ko' ? `전년비 ${sign}${v.toFixed(1)}%p` : `vs LY ${sign}${v.toFixed(1)}%p`;
  };

  const formatYoy = (v: number | null | undefined) => {
    if (v === null || v === undefined) return 'YoY N/A';
    return `YoY ${v.toFixed(0)}%`;
  };

  const metricTone = (v: number | null | undefined, pivot = 0) => {
    if (v === null || v === undefined) return 'text-gray-500 bg-gray-100';
    if (v > pivot) return 'text-blue-700 bg-blue-50';
    if (v < pivot) return 'text-red-700 bg-red-50';
    return 'text-gray-700 bg-gray-100';
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg shadow-md p-6 border-l-4 border-green-600">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">
                {categoryFilter === 'clothes' ? t(language, 'section2HeaderClothes') : t(language, 'section2HeaderAll')}
                {season && <span className="ml-2 text-sm text-purple-600">({season})</span>}
                <span className="ml-2 text-xs text-gray-500">{t(language, 'tagBasis')}</span>
              </h3>
            </div>
            <p className="text-xs text-gray-600">{t(language, 'section2Subtitle')}</p>
            <p className="text-xs text-gray-500">{currencyUnit}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">{t(language, 'filterCategory')}</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-2.5 py-1 text-xs font-medium rounded-l-lg transition-colors ${
                categoryFilter === 'clothes' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-r-lg transition-colors ${
                categoryFilter === 'all' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-600 mb-1">{t(language, 'sellRate')}</div>
          <div className="text-xl font-bold text-green-600">{sellthrough.toFixed(1)}%</div>
          <div
            className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${metricTone(
              sellthroughYoyPp,
              0
            )}`}
          >
            {formatPp(sellthroughYoyPp)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-600 mb-1">{t(language, 'cumulativeSales')}</div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(totalSales)}</div>
          <div
            className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${metricTone(
              salesYoyPct,
              100
            )}`}
          >
            {formatYoy(salesYoyPct)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-600 mb-1">{t(language, 'cumulativeInbound')}</div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(totalInbound)}</div>
          <div
            className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${metricTone(
              inboundYoyPct,
              100
            )}`}
          >
            {formatYoy(inboundYoyPct)}
          </div>
        </div>
      </div>
    </div>
  );
}
