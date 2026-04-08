'use client';

import type { Language } from '@/lib/translations';

type StoreMatrixItem = {
  shopCd: string;
  shopName: string;
  channel: string;
  currentSales: number;
  previousSales: number;
  yoy: number | null;
  discountRate: number | null;
  discountDiff: number | null;
};

interface Section1StoreCountMatrixModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  isYtdMode: boolean;
  items: {
    previous: StoreMatrixItem[];
    current: StoreMatrixItem[];
    sameStore: StoreMatrixItem[];
  };
}

type RowStatus = 'same' | 'removed' | 'added';

function getStatusDotClass(status: RowStatus) {
  if (status === 'removed') return 'bg-rose-500';
  if (status === 'added') return 'bg-emerald-500';
  return 'bg-violet-500';
}

function getRowClass(status: RowStatus) {
  if (status === 'removed') return 'border-rose-300 bg-rose-100';
  if (status === 'added') return 'border-emerald-300 bg-emerald-100';
  return 'border-gray-200 bg-white';
}

function formatYoy(yoy: number | null) {
  if (yoy === null || !Number.isFinite(yoy)) return 'YoY -';
  return `YoY ${yoy.toFixed(0)}%`;
}

function formatDiscountRate(value: number | null, language: Language) {
  const label = language === 'ko' ? '할인율' : 'Disc';
  if (value === null || !Number.isFinite(value)) return `${label} -`;
  return `${label} ${value.toFixed(1)}%`;
}

function formatDiscountDiff(value: number | null, language: Language) {
  const label = language === 'ko' ? '증감' : 'Diff';
  if (value === null || !Number.isFinite(value)) return `${label} -`;
  if (value > 0) return `${label} +${value.toFixed(1)}%p`;
  if (value < 0) return `${label} -${Math.abs(value).toFixed(1)}%p`;
  return `${label} 0.0%p`;
}

function getYoyBadgeClass(yoy: number | null) {
  if (yoy === null || !Number.isFinite(yoy)) return 'border-gray-200 bg-gray-50 text-gray-500';
  if (yoy >= 100) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function getDiscountRateBadgeClass(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'border-gray-200 bg-gray-50 text-gray-500';
  if (value >= 30) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value >= 20) return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-violet-200 bg-violet-50 text-violet-700';
}

function getDiscountDiffBadgeClass(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'border-gray-200 bg-gray-50 text-gray-500';
  if (value > 0) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value < 0) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

function renderMetricBadge(text: string, className: string) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${className}`}>
      {text}
    </span>
  );
}

function renderStoreRow(item: StoreMatrixItem, status: RowStatus, language: Language, showMetrics = false, extraBadge?: string) {
  const showYoy = showMetrics && status === 'same';
  const showDiscountMetrics = showMetrics && status === 'same';

  return (
    <div
      key={`${status}-${item.shopCd}`}
      className={`grid h-7 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border px-2 ${getRowClass(status)}`}
      title={`${item.shopCd} ${item.shopName}`}
    >
      <span className={`h-2 w-2 rounded-full ${getStatusDotClass(status)}`} />

      <div className="min-w-0 flex items-center gap-1 overflow-hidden">
        <span className="shrink-0 text-[12px] font-semibold leading-none text-gray-900">{item.shopCd}</span>
        <span className="min-w-0 truncate text-[10px] leading-none text-gray-700">{item.shopName}</span>
        <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-1 py-0.5 text-[9px] leading-none text-gray-600">
          {item.channel || '-'}
        </span>
        {extraBadge ? (
          <span
            className={`shrink-0 rounded-full border px-1 py-0.5 text-[9px] font-semibold leading-none ${
              status === 'removed'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {extraBadge}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {showYoy ? renderMetricBadge(formatYoy(item.yoy), getYoyBadgeClass(item.yoy)) : null}
        {showDiscountMetrics
          ? renderMetricBadge(formatDiscountRate(item.discountRate, language), getDiscountRateBadgeClass(item.discountRate))
          : null}
        {showDiscountMetrics
          ? renderMetricBadge(formatDiscountDiff(item.discountDiff, language), getDiscountDiffBadgeClass(item.discountDiff))
          : null}
      </div>
    </div>
  );
}

export default function Section1StoreCountMatrixModal({
  open,
  onClose,
  language,
  isYtdMode,
  items,
}: Section1StoreCountMatrixModalProps) {
  if (!open) return null;

  const previousMap = new Map(items.previous.map((item) => [item.shopCd, item]));
  const currentMap = new Map(items.current.map((item) => [item.shopCd, item]));
  const allCodes = Array.from(new Set([...previousMap.keys(), ...currentMap.keys()])).sort((a, b) => a.localeCompare(b));
  const removedCodes = allCodes.filter((code) => previousMap.has(code) && !currentMap.has(code));
  const addedCodes = allCodes.filter((code) => currentMap.has(code) && !previousMap.has(code));
  const removedSummary = removedCodes.join(', ');
  const addedSummary = addedCodes.join(', ');

  const title = language === 'ko' ? '전년/당년 매장 비교' : 'LY/TY Store Comparison';
  const subtitle = isYtdMode
    ? language === 'ko'
      ? 'YTD 기준으로 실제 누적 매출이 있는 매장만 비교합니다.'
      : 'Compared using stores with cumulative sales in YTD.'
    : language === 'ko'
      ? '당년 리스트에서 공통, 신규, 폐점을 한 번에 보여줍니다.'
      : 'Shows TY list with common, added, and closed stores together.';
  const currentLabel = language === 'ko' ? '당년 매장 리스트' : 'TY Stores';
  const closedLabel = language === 'ko' ? '폐점' : 'Closed';
  const addedLabel = language === 'ko' ? '신규' : 'New';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                {language === 'ko' ? '공통' : 'Common'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                {language === 'ko' ? '폐점/이탈' : 'Closed/Removed'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {language === 'ko' ? '신규/재진입' : 'Added'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {language === 'ko' ? '닫기' : 'Close'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gray-50 p-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{currentLabel}</p>
              {addedCodes.length > 0 ? (
                <span className="truncate text-[10px] text-emerald-700" title={addedSummary}>
                  {language === 'ko' ? `신규: ${addedSummary}` : `Added: ${addedSummary}`}
                </span>
              ) : null}
              {removedCodes.length > 0 ? (
                <span className="truncate text-[10px] text-rose-700" title={removedSummary}>
                  {language === 'ko' ? `폐점: ${removedSummary}` : `Closed: ${removedSummary}`}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-600">
              {language === 'ko' ? `${allCodes.length}개 비교` : `${allCodes.length} stores compared`}
            </p>
          </div>

          <div className="mt-2 space-y-1">
            {allCodes.map((code) => {
              const currentItem = currentMap.get(code);
              if (currentItem) {
                const status: RowStatus = previousMap.has(code) ? 'same' : 'added';
                return renderStoreRow(
                  currentItem,
                  status,
                  language,
                  true,
                  status === 'added' ? addedLabel : undefined
                );
              }

              const previousItem = previousMap.get(code);
              if (!previousItem) return null;

              return renderStoreRow(previousItem, 'removed', language, true, closedLabel);
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
