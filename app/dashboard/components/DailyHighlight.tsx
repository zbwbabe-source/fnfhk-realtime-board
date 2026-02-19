'use client';

import { type Language } from '@/lib/translations';

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

const formatPct = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' ? `${value.toFixed(digits)}%` : 'N/A';

const formatShort = (value: number | null | undefined) => {
  if (typeof value !== 'number') return 'N/A';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${value.toFixed(0)}`;
};

const formatDays = (value: number | null | undefined, language: Language) => {
  if (typeof value !== 'number') return 'N/A';
  return language === 'ko' ? `${Math.round(value)}일` : `${Math.round(value)} days`;
};

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
  const hkmcMtdYoy = hkmcSection1Data?.total_subtotal?.yoy;
  const twMtdYoy = twSection1Data?.total_subtotal?.yoy;
  const hkmcYtdYoy = hkmcSection1Data?.total_subtotal?.yoy_ytd;
  const twYtdYoy = twSection1Data?.total_subtotal?.yoy_ytd;

  const hkmcSellthrough = hkmcSection2Data?.header?.overall_sellthrough;
  const twSellthrough = twSection2Data?.header?.overall_sellthrough;

  const hkmcOldStock = hkmcSection3Data?.header?.curr_stock_amt;
  const twOldStock = twSection3Data?.header?.curr_stock_amt;
  const hkmcInvDays = hkmcSection3Data?.header?.inv_days;
  const twInvDays = twSection3Data?.header?.inv_days;

  return (
    <section className="mb-6 rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Executive Insight</h2>
        <p className="text-xs text-gray-500">
          {date} | {brand} | {isYtdMode ? 'YTD' : 'MTD'}
        </p>
      </div>

      <div className="space-y-1.5 text-sm text-gray-700">
        {language === 'ko' ? (
          <>
            <p>
              1. 실판매출 YoY: HKMC 당월 <span className="font-semibold text-purple-600">{formatPct(hkmcMtdYoy, 0)}</span>, 누적{' '}
              <span className="font-semibold text-purple-600">{formatPct(hkmcYtdYoy, 0)}</span> / TW 당월{' '}
              <span className="font-semibold text-purple-600">{formatPct(twMtdYoy, 0)}</span>, 누적{' '}
              <span className="font-semibold text-purple-600">{formatPct(twYtdYoy, 0)}</span>.
            </p>
            <p>
              2. 당시즌 판매율: HKMC <span className="font-semibold text-purple-600">{formatPct(hkmcSellthrough)}</span> vs TW{' '}
              <span className="font-semibold text-purple-600">{formatPct(twSellthrough)}</span>.
            </p>
            <p>
              3. 과시즌재고 잔액 및 재고일수 (25/9/1~ 누적): HKMC <span className="font-semibold text-purple-600">{formatShort(hkmcOldStock)}</span> /{' '}
              <span className="font-semibold text-purple-600">{formatDays(hkmcInvDays, language)}</span>, TW{' '}
              <span className="font-semibold text-purple-600">{formatShort(twOldStock)}</span> /{' '}
              <span className="font-semibold text-purple-600">{formatDays(twInvDays, language)}</span>.
            </p>
          </>
        ) : (
          <>
            <p>
              1. Store sales MTD YoY / YTD YoY: HKMC MTD <span className="font-semibold text-purple-600">{formatPct(hkmcMtdYoy, 0)}</span> / YTD{' '}
              <span className="font-semibold text-purple-600">{formatPct(hkmcYtdYoy, 0)}</span>, TW MTD{' '}
              <span className="font-semibold text-purple-600">{formatPct(twMtdYoy, 0)}</span> / YTD{' '}
              <span className="font-semibold text-purple-600">{formatPct(twYtdYoy, 0)}</span>.
            </p>
            <p>
              2. In-season sell-through: HKMC <span className="font-semibold text-purple-600">{formatPct(hkmcSellthrough)}</span> vs TW{' '}
              <span className="font-semibold text-purple-600">{formatPct(twSellthrough)}</span>.
            </p>
            <p>
              3. Old-season stock balance & inventory days (cumulative from 25/9/1): HKMC{' '}
              <span className="font-semibold text-purple-600">{formatShort(hkmcOldStock)}</span> /{' '}
              <span className="font-semibold text-purple-600">{formatDays(hkmcInvDays, language)}</span>, TW{' '}
              <span className="font-semibold text-purple-600">{formatShort(twOldStock)}</span> /{' '}
              <span className="font-semibold text-purple-600">{formatDays(twInvDays, language)}</span>.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
