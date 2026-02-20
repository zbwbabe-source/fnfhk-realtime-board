'use client';

import { useEffect, useMemo, useState } from 'react';
import { type Language } from '@/lib/translations';
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
  isYtdMode,
  hkmcSection1Data,
  hkmcSection2Data,
  hkmcSection3Data,
  twSection1Data,
  twSection2Data,
  twSection3Data,
}: DailyHighlightProps) {
  const [data, setData] = useState<ExecutiveInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const isInsightInputReady =
    !!hkmcSection1Data?.total_subtotal &&
    !!twSection1Data?.total_subtotal &&
    !!hkmcSection2Data?.header &&
    !!twSection2Data?.header &&
    !!hkmcSection3Data?.header &&
    !!twSection3Data?.header;

  const inputPayload = useMemo(() => {
    return {
      brand,
      asOfDate: date,
      mode: isYtdMode ? 'YTD' : 'MTD',
      region: 'ALL',
      hkmc: {
        salesMtdYoy: hkmcSection1Data?.total_subtotal?.yoy ?? null,
        salesYtdYoy: hkmcSection1Data?.total_subtotal?.yoy_ytd ?? null,
        seasonSellthrough: hkmcSection2Data?.header?.overall_sellthrough ?? null,
        oldStock: hkmcSection3Data?.header?.curr_stock_amt ?? null,
        invDays: hkmcSection3Data?.header?.inv_days ?? null,
      },
      tw: {
        salesMtdYoy: twSection1Data?.total_subtotal?.yoy ?? null,
        salesYtdYoy: twSection1Data?.total_subtotal?.yoy_ytd ?? null,
        seasonSellthrough: twSection2Data?.header?.overall_sellthrough ?? null,
        oldStock: twSection3Data?.header?.curr_stock_amt ?? null,
        invDays: twSection3Data?.header?.inv_days ?? null,
      },
    };
  }, [
    brand,
    date,
    isYtdMode,
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
      setLoading(true);
      try {
        const response = await fetch('/api/insights/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inputPayload),
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

  return (
    <section className="mb-6 rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{data?.title || 'Executive Insight'}</h2>
        <p className="text-xs text-gray-500">{data?.asOfLabel || `${date} | ${brand} | ${isYtdMode ? 'YTD' : 'MTD'}`}</p>
      </div>

      {loading && !data ? (
        <p className="text-sm text-gray-500">Generating insight...</p>
      ) : (
        <div className="space-y-3">
          {data?.compareLine ? <p className="text-sm text-gray-700">{data.compareLine}</p> : null}

          <div className="space-y-2">
            {(data?.blocks || []).map((block) => (
              <div key={block.id} className="flex items-start gap-2 text-sm">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${toneClass(block.tone)}`}>{block.label}</span>
                <p className={toneTextClass(block.tone)}>{block.text}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1 pt-1">
            {(data?.actions || []).map((action) => (
              <p key={action.priority} className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">{action.priority}.</span> {action.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
