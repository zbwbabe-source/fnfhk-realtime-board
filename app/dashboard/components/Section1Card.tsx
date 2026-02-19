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

export default function Section1Card({ isYtdMode, section1Data, language, brand, region, date, onYtdModeToggle }: Section1CardProps) {
  const formatCurrency = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
  };

  const calculateKPIs = () => {
    if (!section1Data?.total_subtotal) {
      return {
        k1: { label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual'), value: 'N/A' },
        k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' },
        k3: { label: t(language, 'progress'), value: 'N/A' },
      };
    }

    const total = section1Data.total_subtotal;

    if (isYtdMode) {
      if (typeof total.ytd_act === 'undefined' || total.ytd_act === null) {
        return {
          k1: { label: t(language, 'ytdActual'), value: 'N/A' },
          k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    } else {
      if (typeof total.mtd_act === 'undefined' || total.mtd_act === null) {
        return {
          k1: { label: t(language, 'monthlyActual'), value: 'N/A' },
          k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    }

    const actual = isYtdMode ? total.ytd_act : total.mtd_act;
    const compareRate = brand === 'X' ? (isYtdMode ? total.yoy_ytd : total.mom) : (isYtdMode ? total.yoy_ytd : total.yoy);
    const progress = isYtdMode ? total.progress_ytd : total.progress;
    const discountRate = isYtdMode ? total.discount_rate_ytd : total.discount_rate_mtd;

    const hasCompareRate = compareRate && compareRate !== 0;
    const hasDiscountRate = typeof discountRate === 'number' && !isNaN(discountRate);

    return {
      k1: {
        label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual'),
        value: formatCurrency(actual),
      },
      k2: {
        label: hasCompareRate
          ? t(language, brand === 'X' ? 'mom' : 'yoy')
          : 'Discount Rate',
        value: hasCompareRate
          ? `${compareRate.toFixed(0)}%`
          : (hasDiscountRate ? `${discountRate.toFixed(1)}%` : 'N/A'),
      },
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
      },
    };
  };

  const kpis = calculateKPIs();
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');

  return (
    <article className="rounded-2xl border border-gray-200 border-l-4 border-l-blue-500 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 leading-tight">{t(language, 'section1Title')}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section1Subtitle')}</p>
        </div>

        {onYtdModeToggle && (
          <div className="shrink-0 space-y-1.5 text-right">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <button
                onClick={() => {
                  if (isYtdMode) {
                    onYtdModeToggle();
                  }
                }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  !isYtdMode ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'mtdToggle')}
              </button>
              <button
                onClick={() => {
                  if (!isYtdMode) {
                    onYtdModeToggle();
                  }
                }}
                className={`border-l border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors ${
                  isYtdMode ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
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

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpis.k1.label}</p>
          <p className="text-3xl font-bold tabular-nums text-gray-900 leading-none">{kpis.k1.value}</p>
        </div>
        <div className="space-y-2 border-l border-gray-200 pl-6">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpis.k2.label}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">{kpis.k2.value}</p>
        </div>
        <div className="space-y-2 border-l border-gray-200 pl-6">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpis.k3.label}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">{kpis.k3.value}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-gray-200 pt-3 text-[10px] uppercase tracking-wide text-gray-400">{currencyUnit}</div>
    </article>
  );
}
