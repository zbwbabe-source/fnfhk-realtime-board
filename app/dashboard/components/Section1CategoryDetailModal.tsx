'use client';

import { useEffect, useState } from 'react';
import { t, type Language } from '@/lib/translations';
import type { Section1CategoryDetailKey } from '@/lib/section1/category-detail';

interface Section1CategoryDetailModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  region: string;
  brand: string;
  date: string;
  categoryKey: Section1CategoryDetailKey;
  categoryTitle: string;
  isYtdMode: boolean;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
}

interface Section1CategoryDetailRow {
  key: string;
  category_small: string;
  category_label: string;
  middle_category: string;
  sales_act: number;
  sales_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
  sales_share_pct: number;
  sales_share_diff_pct: number | null;
}

interface Section1CategoryDetailPayload {
  asof_date: string;
  period_start_date: string;
  mode: 'mtd' | 'ytd';
  category_title: string;
  header: {
    sales_act: number;
    sales_yoy_pct: number | null;
    discount_rate: number | null;
    discount_rate_diff: number | null;
  };
  rows: Section1CategoryDetailRow[];
}

export default function Section1CategoryDetailModal({
  open,
  onClose,
  language,
  region,
  brand,
  date,
  categoryKey,
  categoryTitle,
  isYtdMode,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
}: Section1CategoryDetailModalProps) {
  const [data, setData] = useState<Section1CategoryDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'mtd' | 'ytd'>(isYtdMode ? 'ytd' : 'mtd');

  useEffect(() => {
    if (!open) return;
    setMode(isYtdMode ? 'ytd' : 'mtd');
  }, [open, isYtdMode]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    const controller = new AbortController();

    async function fetchDetail() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          region,
          brand,
          date,
          mode,
          category_key: categoryKey,
        });

        const response = await fetch(`/api/section1/category-detail?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.message || json?.error || 'Failed to fetch category detail');
        }

        if (!active) return;
        setData(json);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (!active) return;
        setError(err?.message || 'Failed to fetch category detail');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDetail();

    return () => {
      active = false;
      controller.abort();
    };
  }, [open, region, brand, date, mode, categoryKey]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const formatCurrency = (value: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? value * hkdToTwdRate : value;
    if (converted >= 1_000_000) return `${(converted / 1_000_000).toFixed(1)}M`;
    if (converted >= 1_000) return `${(converted / 1_000).toFixed(1)}K`;
    return converted.toFixed(0);
  };

  const formatPercent = (value: number | null | undefined, digits = 1) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return `${value.toFixed(digits)}%`;
  };

  const formatYoy = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return `${value.toFixed(0)}%`;
  };

  const formatDiff = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    if (value > 0) return `+${value.toFixed(1)}%p`;
    if (value < 0) return `△${Math.abs(value).toFixed(1)}%p`;
    return '0.0%p';
  };

  const yoyClass = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-gray-400';
    return value >= 100 ? 'text-green-600' : 'text-red-500';
  };

  const diffClass = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-gray-400';
    if (value > 0) return 'text-red-500';
    if (value < 0) return 'text-green-600';
    return 'text-gray-500';
  };

  const labels = {
    title: language === 'ko' ? '카테고리 판매 상세' : 'Category Sales Detail',
    salesAct: language === 'ko' ? '실판매출' : 'Actual Sales',
    salesYoy: language === 'ko' ? '판매 YoY' : 'Sales YoY',
    discount: language === 'ko' ? '할인율' : 'Discount Rate',
    discountDiff: language === 'ko' ? '전년비 증감' : 'vs LY',
    salesShare: language === 'ko' ? '비중' : 'Share',
    salesShareDiff: language === 'ko' ? '비중 증감' : 'Share vs LY',
    smallCategory: language === 'ko' ? '카테고리' : 'Category',
    middleCategory: language === 'ko' ? '중분류' : 'Middle',
    close: language === 'ko' ? '닫기' : 'Close',
    loading: language === 'ko' ? '로딩 중...' : 'Loading...',
    empty: language === 'ko' ? '데이터가 없습니다.' : 'No data available.',
    asOf: language === 'ko' ? '기준' : 'As of',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-bold text-gray-900">{labels.title}</h2>
              <p className="mt-1 text-lg font-bold tracking-tight text-gray-800 sm:text-xl">
                {data?.category_title || categoryTitle}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {labels.asOf}:{' '}
                {data?.period_start_date || (mode === 'ytd' ? `${date.slice(0, 4)}-01-01` : `${date.slice(0, 7)}-01`)}
                ~{data?.asof_date || date}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setMode('mtd')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'mtd' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  MTD
                </button>
                <button
                  type="button"
                  onClick={() => setMode('ytd')}
                  className={`border-l border-gray-200 px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'ytd' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  YTD
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {labels.close}
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(92vh-84px)] overflow-y-auto px-5 py-5 sm:px-6">
          {loading && <div className="flex h-52 items-center justify-center text-sm text-gray-500">{labels.loading}</div>}

          {!loading && error && (
            <div className="flex h-52 items-center justify-center text-sm font-medium text-red-500">{error}</div>
          )}

          {!loading && !error && !data && (
            <div className="flex h-52 items-center justify-center text-sm text-gray-500">{labels.empty}</div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.salesAct}</p>
                  <p className="mt-2 text-[20px] font-bold tabular-nums text-gray-900">
                    {formatCurrency(data.header.sales_act)}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.salesYoy}</p>
                  <p className={`mt-2 text-[20px] font-bold tabular-nums ${yoyClass(data.header.sales_yoy_pct)}`}>
                    {formatYoy(data.header.sales_yoy_pct)}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.discount}</p>
                  <p className="mt-2 text-[20px] font-bold tabular-nums text-sky-700">
                    {formatPercent(data.header.discount_rate)}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.discountDiff}</p>
                  <p className={`mt-2 text-[20px] font-bold tabular-nums ${diffClass(data.header.discount_rate_diff)}`}>
                    {formatDiff(data.header.discount_rate_diff)}
                  </p>
                </div>
              </div>

              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h3 className="text-[17px] font-bold text-gray-900">{labels.title}</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left font-semibold">{labels.smallCategory}</th>
                        <th className="px-4 py-3 text-left font-semibold">{labels.middleCategory}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesAct}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesYoy}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.discount}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.discountDiff}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesShare}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesShareDiff}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr key={row.key} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-gray-900">{row.category_label}</td>
                          <td className="px-4 py-3 text-gray-600">{row.middle_category}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(row.sales_act)}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${yoyClass(row.sales_yoy_pct)}`}>
                            {formatYoy(row.sales_yoy_pct)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-sky-700">
                            {formatPercent(row.discount_rate)}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${diffClass(row.discount_rate_diff)}`}>
                            {formatDiff(row.discount_rate_diff)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {formatPercent(row.sales_share_pct)}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${diffClass(row.sales_share_diff_pct)}`}>
                            {formatDiff(row.sales_share_diff_pct)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50/80">
                        <td className="px-4 py-4 font-bold text-gray-900">{language === 'ko' ? '전체' : 'Total'}</td>
                        <td className="px-4 py-4 text-gray-500">-</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-900">
                          {formatCurrency(data.header.sales_act)}
                        </td>
                        <td className={`px-4 py-4 text-right font-bold tabular-nums ${yoyClass(data.header.sales_yoy_pct)}`}>
                          {formatYoy(data.header.sales_yoy_pct)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-sky-700">
                          {formatPercent(data.header.discount_rate)}
                        </td>
                        <td className={`px-4 py-4 text-right font-bold tabular-nums ${diffClass(data.header.discount_rate_diff)}`}>
                          {formatDiff(data.header.discount_rate_diff)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-700">100.0%</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-500">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <p className="text-[11px] text-gray-500">
                {region === 'TW' ? `${language === 'ko' ? '단위' : 'Unit'}: ${currencyCode}` : t(language, 'cardUnit')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
