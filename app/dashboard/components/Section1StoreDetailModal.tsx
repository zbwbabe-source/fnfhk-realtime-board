'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { t, type Language } from '@/lib/translations';
import { getCategoryTooltipText } from '@/lib/category-utils';

interface Section1StoreDetailModalProps {
  open: boolean;
  onClose: () => void;
  onOpenAllStores?: () => void;
  language: Language;
  region: string;
  brand: string;
  date: string;
  shopCd: string;
  storeName: string;
  isYtdMode: boolean;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
}

interface StoreDetailProductRow {
  prdt_cd: string;
  sesn: string;
  category: string;
  category_small: string;
  category_large: string;
  sales_tag: number;
  sales_act: number;
  sales_tag_yoy_pct: number | null;
  sales_act_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
}

interface StoreDetailSmallCategoryRow {
  category_small_key: string;
  category_small: string;
  sales_tag: number;
  sales_act: number;
  sales_share_pct: number;
  sales_tag_yoy_pct: number | null;
  sales_act_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
  product_count: number;
}

interface StoreDetailCategoryRow {
  category: string;
  sales_tag: number;
  sales_act: number;
  sales_share_pct: number;
  sales_tag_yoy_pct: number | null;
  sales_act_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
  product_count: number;
  small_categories: StoreDetailSmallCategoryRow[];
}

interface StoreDetailPayload {
  asof_date: string;
  period_start_date: string;
  mode: 'mtd' | 'ytd';
  header: {
    shop_cd: string;
    shop_name: string;
    sales_tag: number;
    sales_act: number;
    sales_tag_yoy_pct: number | null;
    sales_yoy_pct: number | null;
    discount_rate: number | null;
    discount_rate_diff: number | null;
  };
  categories: StoreDetailCategoryRow[];
  products_by_small_category: Record<string, StoreDetailProductRow[]>;
}

export default function Section1StoreDetailModal({
  open,
  onClose,
  onOpenAllStores,
  language,
  region,
  brand,
  date,
  shopCd,
  storeName,
  isYtdMode,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
}: Section1StoreDetailModalProps) {
  const [data, setData] = useState<StoreDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedSmallCategories, setExpandedSmallCategories] = useState<string[]>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
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
          shop_cd: shopCd,
          mode,
        });

        const response = await fetch(`/api/section1/store-detail?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.message || json?.error || 'Failed to fetch store detail');
        }

        if (!active) return;
        setData(json);
        setExpandedCategories([]);
        setExpandedSmallCategories([]);
        setShowAllCategories(false);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (!active) return;
        setError(err?.message || 'Failed to fetch store detail');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDetail();

    return () => {
      active = false;
      controller.abort();
    };
  }, [open, region, brand, date, shopCd, mode]);

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

  const translateLargeCategory = (value: string) => {
    if (language === 'ko') return value;

    const mapped = t(language, value as any);
    if (mapped && mapped !== value) return mapped;

    const fallbackMap: Record<string, string> = {
      의류: 'Apparel',
      당시즌의류: 'Current Apparel',
      '1년차의류': '1Y Apparel',
      '2년차의류': '2Y Apparel',
      과시즌의류: 'Old Apparel',
      과시즌F: 'Old F',
      과시즌S: 'Old S',
      모자: 'Headwear',
      신발: 'Shoes',
      가방: 'Bags',
      기타악세: 'Others',
    };

    return fallbackMap[value] || value;
  };

  const visibleCategories = useMemo(() => {
    if (!data) return [];
    const hasSeasonBuckets = data.categories.some((category) =>
      ['당시즌의류', '1년차의류', '2년차의류', '과시즌의류', '과시즌F', '과시즌S'].includes(category.category)
    );
    if (hasSeasonBuckets) return data.categories;
    return showAllCategories ? data.categories : data.categories.slice(0, 5);
  }, [data, showAllCategories]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  };

  const toggleSmallCategory = (categorySmallKey: string) => {
    setExpandedSmallCategories((current) =>
      current.includes(categorySmallKey)
        ? current.filter((item) => item !== categorySmallKey)
        : [...current, categorySmallKey]
    );
  };

  const labels = {
    title: language === 'ko' ? '매장별 판매 구성' : 'Store Sales Mix',
    categorySummary: language === 'ko' ? '카테고리별 집계' : 'Category Summary',
    category: language === 'ko' ? '카테고리' : 'Category',
    smallCategory: language === 'ko' ? '소분류' : 'Subcategory',
    salesTag: language === 'ko' ? '택판매' : 'Sales(TAG)',
    salesAct: language === 'ko' ? '실판매' : 'Actual Sales',
    salesShare: language === 'ko' ? '판매비중(Tag)' : 'Sales Share(TAG)',
    tagYoy: language === 'ko' ? '택판매 YoY' : 'TAG YoY',
    actYoy: language === 'ko' ? '실판매 YoY' : 'Act YoY',
    discount: language === 'ko' ? '할인율' : 'Discount Rate',
    discountDiff: language === 'ko' ? '전년비' : 'vs LY',
    skuCount: language === 'ko' ? '품번수' : 'SKUs',
    detail: language === 'ko' ? '상세' : 'Detail',
    sku: language === 'ko' ? '품번' : 'SKU',
    viewSkus: language === 'ko' ? '품번보기' : 'View SKUs',
    closeSkus: language === 'ko' ? '품번닫기' : 'Hide SKUs',
    showAll: language === 'ko' ? '전체보기' : 'Show All',
    topFive: language === 'ko' ? '상위 5개만' : 'Top 5 Only',
    close: language === 'ko' ? '닫기' : 'Close',
    asOf: language === 'ko' ? '기준' : 'As of',
    loading: language === 'ko' ? '로딩 중...' : 'Loading...',
    empty: language === 'ko' ? '데이터가 없습니다.' : 'No data available.',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-bold text-gray-900">{labels.title}</h2>
              <p className="mt-1 text-lg font-bold tracking-tight text-gray-800 sm:text-xl">{storeName}</p>
              <p className="mt-1 text-xs text-gray-500">
                {labels.asOf}:{' '}
                {data?.period_start_date || (mode === 'ytd' ? `${date.slice(0, 4)}-01-01` : `${date.slice(0, 7)}-01`)}
                ~{data?.asof_date || date}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {onOpenAllStores && (
                <button
                  type="button"
                  onClick={onOpenAllStores}
                  className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
                >
                  {language === 'ko' ? '매장 전체 보기' : 'All Stores'}
                </button>
              )}
              <div className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setMode('mtd')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'mtd' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  MTD
                </button>
                <button
                  type="button"
                  onClick={() => setMode('ytd')}
                  className={`border-l border-gray-200 px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'ytd' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
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
          {loading && (
            <div className="flex h-52 items-center justify-center text-sm text-gray-500">{labels.loading}</div>
          )}

          {!loading && error && (
            <div className="flex h-52 items-center justify-center text-sm font-medium text-red-500">{error}</div>
          )}

          {!loading && !error && !data && (
            <div className="flex h-52 items-center justify-center text-sm text-gray-500">{labels.empty}</div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.salesTag}</p>
                  <p className="mt-2 text-[20px] font-bold tabular-nums text-gray-900">{formatCurrency(data.header.sales_tag)}</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.salesAct}</p>
                  <p className="mt-2 text-[20px] font-bold tabular-nums text-gray-900">{formatCurrency(data.header.sales_act)}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">{labels.discount}</p>
                  <p className="mt-2 text-[20px] font-bold tabular-nums text-sky-700">
                    {formatPercent(data.header.discount_rate)}
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${diffClass(data.header.discount_rate_diff)}`}>
                    {labels.discountDiff} {formatDiff(data.header.discount_rate_diff)}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">{language === 'ko' ? '실판 YoY' : 'Actual YoY'}</p>
                  <p className={`mt-2 text-[20px] font-bold tabular-nums ${yoyClass(data.header.sales_yoy_pct)}`}>
                    {formatYoy(data.header.sales_yoy_pct)}
                  </p>
                </div>
              </div>

              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
                  <h3 className="text-[17px] font-bold text-gray-900">{labels.categorySummary}</h3>
                  {data.categories.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories((current) => !current)}
                      className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
                    >
                      {showAllCategories ? labels.topFive : labels.showAll}
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <CategoryTableColGroup />
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left font-semibold">{labels.category}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesTag}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesAct}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.salesShare}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.tagYoy}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.actYoy}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.discount}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.discountDiff}</th>
                        <th className="px-4 py-3 text-right font-semibold">{labels.skuCount}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCategories.map((category) => {
                        const expanded = expandedCategories.includes(category.category);

                        return (
                          <FragmentRow
                            keyValue={category.category}
                            header={
                              <tr className="border-b border-gray-100">
                                <td className="px-4 py-4">
                                  <button
                                    type="button"
                                    onClick={() => toggleCategory(category.category)}
                                    className="flex items-center gap-2 font-semibold text-gray-900"
                                  >
                                    <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
                                    <span>{translateLargeCategory(category.category)}</span>
                                  </button>
                                </td>
                                <td className="px-4 py-4 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(category.sales_tag)}</td>
                                <td className="px-4 py-4 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(category.sales_act)}</td>
                                <td className="px-4 py-4 text-right tabular-nums text-gray-600">{formatPercent(category.sales_share_pct)}</td>
                                <td className={`px-4 py-4 text-right font-semibold tabular-nums ${yoyClass(category.sales_tag_yoy_pct)}`}>{formatYoy(category.sales_tag_yoy_pct)}</td>
                                <td className={`px-4 py-4 text-right font-semibold tabular-nums ${yoyClass(category.sales_act_yoy_pct)}`}>{formatYoy(category.sales_act_yoy_pct)}</td>
                                <td className="px-4 py-4 text-right font-semibold tabular-nums text-sky-700">{formatPercent(category.discount_rate)}</td>
                                <td className={`px-4 py-4 text-right font-semibold tabular-nums ${diffClass(category.discount_rate_diff)}`}>{formatDiff(category.discount_rate_diff)}</td>
                                <td className="px-4 py-4 text-right tabular-nums text-gray-500">{category.product_count}</td>
                              </tr>
                            }
                            detail={
                              expanded ? (
                                <tr className="border-b border-gray-100 bg-slate-50/70">
                                  <td colSpan={9} className="px-0 py-0">
                                    <div className="overflow-hidden bg-slate-50/70">
                                      <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                          <CategoryTableColGroup />
                                          <tbody>
                                            {category.small_categories.map((smallCategory) => {
                                              const smallExpanded = expandedSmallCategories.includes(smallCategory.category_small_key);
                                              const products = data.products_by_small_category[smallCategory.category_small_key] || [];

                                              return (
                                                <FragmentRow
                                                  keyValue={smallCategory.category_small_key}
                                                  header={
                                                    <tr className="border-b border-slate-200/80 bg-slate-50/70">
                                                      <td className="px-4 py-4">
                                                        <button
                                                          type="button"
                                                          onClick={() => toggleSmallCategory(smallCategory.category_small_key)}
                                                          className="flex items-center gap-2 pl-5 font-medium text-slate-700"
                                                        >
                                                          <span className="text-[10px] text-slate-400">{smallExpanded ? '▼' : '▶'}</span>
                                                          <span title={getCategoryTooltipText(smallCategory.category_small)}>{smallCategory.category_small}</span>
                                                        </button>
                                                      </td>
                                                      <td className="px-4 py-4 text-right tabular-nums text-slate-800">{formatCurrency(smallCategory.sales_tag)}</td>
                                                      <td className="px-4 py-4 text-right tabular-nums text-slate-800">{formatCurrency(smallCategory.sales_act)}</td>
                                                      <td className="px-4 py-4 text-right tabular-nums text-slate-500">{formatPercent(smallCategory.sales_share_pct)}</td>
                                                      <td className={`px-4 py-4 text-right font-semibold tabular-nums ${yoyClass(smallCategory.sales_tag_yoy_pct)}`}>{formatYoy(smallCategory.sales_tag_yoy_pct)}</td>
                                                      <td className={`px-4 py-4 text-right font-semibold tabular-nums ${yoyClass(smallCategory.sales_act_yoy_pct)}`}>{formatYoy(smallCategory.sales_act_yoy_pct)}</td>
                                                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-sky-700">{formatPercent(smallCategory.discount_rate)}</td>
                                                      <td className={`px-4 py-4 text-right font-semibold tabular-nums ${diffClass(smallCategory.discount_rate_diff)}`}>{formatDiff(smallCategory.discount_rate_diff)}</td>
                                                      <td className="px-4 py-4 text-right tabular-nums text-slate-500">{smallCategory.product_count}</td>
                                                    </tr>
                                                  }
                                                  detail={
                                                    smallExpanded ? (
                                                      <tr className="bg-slate-100/80">
                                                        <td colSpan={9} className="px-0 py-0">
                                                          <div className="overflow-hidden bg-slate-100/80">
                                                            <div className="overflow-x-auto">
                                                              <table className="min-w-full text-sm">
                                                                <thead className="bg-gray-100 text-gray-700">
                                                                  <tr className="border-b border-gray-200">
                                                                    <th className="px-4 py-3 text-left font-semibold">{labels.sku}</th>
                                                                    <th className="px-4 py-3 text-right font-semibold">{labels.salesTag}</th>
                                                                    <th className="px-4 py-3 text-right font-semibold">{labels.salesAct}</th>
                                                                    <th className="px-4 py-3 text-right font-semibold">{labels.tagYoy}</th>
                                                                    <th className="px-4 py-3 text-right font-semibold">{labels.actYoy}</th>
                                                                    <th className="px-4 py-3 text-right font-semibold">{labels.discount}</th>
                                                                    <th className="px-4 py-3 text-right font-semibold">{labels.discountDiff}</th>
                                                                  </tr>
                                                                </thead>
                                                                <tbody>
                                                                  {products.map((product) => (
                                                                    <tr key={`${smallCategory.category_small_key}-${product.prdt_cd}`} className="border-b border-gray-100 last:border-b-0">
                                                                      <td className="px-4 py-3 font-medium text-gray-800">{product.prdt_cd}</td>
                                                                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(product.sales_tag)}</td>
                                                                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(product.sales_act)}</td>
                                                                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${yoyClass(product.sales_tag_yoy_pct)}`}>{formatYoy(product.sales_tag_yoy_pct)}</td>
                                                                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${yoyClass(product.sales_act_yoy_pct)}`}>{formatYoy(product.sales_act_yoy_pct)}</td>
                                                                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-sky-700">{formatPercent(product.discount_rate)}</td>
                                                                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${diffClass(product.discount_rate_diff)}`}>{formatDiff(product.discount_rate_diff)}</td>
                                                                    </tr>
                                                                  ))}
                                                                </tbody>
                                                              </table>
                                                            </div>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    ) : null
                                                  }
                                                />
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null
                            }
                          />
                        );
                      })}
                      <tr className="bg-gray-50/80">
                        <td className="px-4 py-4 font-bold text-gray-900">{language === 'ko' ? '전체' : 'Total'}</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-900">{formatCurrency(data.header.sales_tag)}</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-900">{formatCurrency(data.header.sales_act)}</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-700">100.0%</td>
                        <td className={`px-4 py-4 text-right font-bold tabular-nums ${yoyClass(data.header.sales_tag_yoy_pct)}`}>{formatYoy(data.header.sales_tag_yoy_pct)}</td>
                        <td className={`px-4 py-4 text-right font-bold tabular-nums ${yoyClass(data.header.sales_yoy_pct)}`}>{formatYoy(data.header.sales_yoy_pct)}</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-sky-700">{formatPercent(data.header.discount_rate)}</td>
                        <td className={`px-4 py-4 text-right font-bold tabular-nums ${diffClass(data.header.discount_rate_diff)}`}>{formatDiff(data.header.discount_rate_diff)}</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-gray-700">
                          {data.categories.reduce((sum, category) => sum + category.product_count, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  keyValue,
  header,
  detail,
}: {
  keyValue: string;
  header: ReactNode;
  detail: ReactNode;
}) {
  return (
    <>
      {header}
      {detail}
    </>
  );
}

function CategoryTableColGroup() {
  return (
    <colgroup>
      <col className="w-[16%]" />
      <col className="w-[11%]" />
      <col className="w-[11%]" />
      <col className="w-[14%]" />
      <col className="w-[11%]" />
      <col className="w-[11%]" />
      <col className="w-[10%]" />
      <col className="w-[10%]" />
      <col className="w-[6%]" />
    </colgroup>
  );
}
