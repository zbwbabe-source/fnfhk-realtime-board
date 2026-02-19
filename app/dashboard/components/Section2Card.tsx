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
    if (v === null || v === undefined) return 'vs LY N/A';
    if (v > 0) {
      return `vs LY +${v.toFixed(1)}%p`;
    }
    if (v < 0) {
      return `vs LY -${Math.abs(v).toFixed(1)}%p`;
    }
    return 'vs LY 0.0%p';
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

  return (
    <article className="rounded-2xl border border-gray-200 border-l-4 border-l-green-500 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 leading-tight">
            {categoryFilter === 'clothes' ? t(language, 'section2HeaderClothes') : t(language, 'section2HeaderAll')}
            {season && <span className="ml-2 text-xs font-medium text-gray-500">({season})</span>}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section2Subtitle')}</p>
        </div>

        <div className="shrink-0 space-y-1.5 text-right">
          <p className="text-xs font-medium text-gray-500">{t(language, 'filterCategory')}</p>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === 'clothes' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`border-l border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === 'all' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t(language, 'sellRate')}</p>
          <p className="text-3xl font-bold tabular-nums text-gray-900 leading-none">{sellthrough.toFixed(1)}%</p>
          <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${metricTone(sellthroughYoyPp, 0)}`}>
            {formatPp(sellthroughYoyPp)}
          </span>
        </div>

        <div className="space-y-2 border-l border-gray-200 pl-6">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t(language, 'cumulativeSales')}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">{formatCurrency(totalSales)}</p>
          <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${metricTone(salesYoyPct, 100)}`}>
            {formatYoy(salesYoyPct)}
          </span>
        </div>

        <div className="space-y-2 border-l border-gray-200 pl-6">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t(language, 'cumulativeInbound')}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">{formatCurrency(totalInbound)}</p>
          <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${metricTone(inboundYoyPct, 100)}`}>
            {formatYoy(inboundYoyPct)}
          </span>
        </div>
      </div>

      <div className="mt-5 border-t border-gray-200 pt-3 text-[10px] uppercase tracking-wide text-gray-400">
        {currencyUnit} | {t(language, 'tagBasis')}
      </div>
    </article>
  );
}
