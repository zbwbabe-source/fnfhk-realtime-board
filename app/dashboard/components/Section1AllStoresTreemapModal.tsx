'use client';

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import type { Language } from '@/lib/translations';

export interface Section1AllStoresTreemapItem {
  storeCode: string;
  storeName: string;
  shortName: string;
  channel?: string;
  mtdSales: number;
  mtdPrevSales: number;
  ytdSales: number;
  ytdPrevSales: number;
  mtdYoy: number | null;
  ytdYoy: number | null;
  mtdTagSales: number;
  ytdTagSales: number;
  mtdDiscountRate: number | null;
  ytdDiscountRate: number | null;
  mtdDiscountRateDiff: number | null;
  ytdDiscountRateDiff: number | null;
}

interface Section1AllStoresTreemapModalProps {
  open: boolean;
  onClose: () => void;
  onStoreSelect?: (storeCode: string, storeName: string) => void;
  language: Language;
  region: string;
  date: string;
  isYtdMode: boolean;
  stores: Section1AllStoresTreemapItem[];
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
}

export default function Section1AllStoresTreemapModal({
  open,
  onClose,
  onStoreSelect,
  language,
  region,
  date,
  isYtdMode,
  stores,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
}: Section1AllStoresTreemapModalProps) {
  const [mode, setMode] = useState<'mtd' | 'ytd'>(isYtdMode ? 'ytd' : 'mtd');
  const title =
    language === 'ko'
      ? `${region === 'TW' ? 'TW' : 'HKMC'} 매장 현황`
      : `${region === 'TW' ? 'TW' : 'HKMC'} Store Status`;

  useEffect(() => {
    if (!open) return;
    setMode(isYtdMode ? 'ytd' : 'mtd');
  }, [open, isYtdMode]);

  const formatCurrency = (value: number) => {
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const converted = region === 'TW' && currencyCode === 'TWD' ? safeValue * hkdToTwdRate : safeValue;
    if (converted >= 1_000_000) return `${(converted / 1_000_000).toFixed(1)}M`;
    if (converted >= 1_000) return `${(converted / 1_000).toFixed(1)}K`;
    return converted.toFixed(0);
  };

  const treemapData = useMemo(() => {
    const base = stores
      .map((store) => ({
        ...store,
        sales: mode === 'ytd' ? store.ytdSales : store.mtdSales,
        prevSales: mode === 'ytd' ? store.ytdPrevSales : store.mtdPrevSales,
        yoy: mode === 'ytd' ? store.ytdYoy : store.mtdYoy,
      }))
      .filter((store) => store.sales > 0)
      .sort((a, b) => b.sales - a.sales);

    const totalSales = base.reduce((sum, store) => sum + store.sales, 0);

    return base.map((store) => ({
      name: store.shortName || store.storeCode,
      storeCode: store.storeCode,
      fullName: store.storeName,
      channel: store.channel,
      value: store.sales,
      sales: store.sales,
      prevSales: store.prevSales,
      tagSales: mode === 'ytd' ? store.ytdTagSales : store.mtdTagSales,
      share: totalSales > 0 ? (store.sales / totalSales) * 100 : 0,
      yoy: store.yoy,
      discountRate: mode === 'ytd' ? store.ytdDiscountRate : store.mtdDiscountRate,
      discountRateDiff: mode === 'ytd' ? store.ytdDiscountRateDiff : store.mtdDiscountRateDiff,
    }));
  }, [stores, mode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/50 p-4 sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-bold text-gray-900">{title}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {language === 'ko'
                  ? `기준: ${mode === 'ytd' ? `${date.slice(0, 4)}-01-01` : `${date.slice(0, 7)}-01`}~${date}`
                  : `As of: ${mode === 'ytd' ? `${date.slice(0, 4)}-01-01` : `${date.slice(0, 7)}-01`}~${date}`}
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
                {language === 'ko' ? '닫기' : 'Close'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(92vh-84px)] overflow-y-auto px-5 py-4 sm:px-6">
          <p className="mb-4 text-sm text-gray-500">
            {language === 'ko'
              ? '사각형 크기는 현재 모드 기준 매출 비중이며, 큰 매장부터 왼쪽에 배치됩니다.'
              : 'Rectangle size reflects sales share in the selected mode, with larger stores placed first.'}
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <div className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-emerald-300 bg-emerald-200" />
              <span>{language === 'ko' ? '정상' : 'Retail'}</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-amber-300 bg-amber-200" />
              <span>{language === 'ko' ? '아울렛' : 'Outlet'}</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-violet-300 bg-violet-200" />
              <span>{language === 'ko' ? '온라인' : 'Online'}</span>
            </div>
          </div>
          <div className="h-[min(62vh,640px)] overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="value"
                aspectRatio={4 / 3}
                stroke="#fff"
                isAnimationActive={false}
                content={<StoreTreemapCell language={language} onStoreSelect={onStoreSelect} />}
              >
                <Tooltip content={<StoreTreemapTooltip formatCurrency={formatCurrency} language={language} />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreTreemapCell({
  language,
  onStoreSelect,
  x,
  y,
  width,
  height,
  name,
  storeCode,
  fullName,
  channel,
  prevSales,
  yoy,
  discountRate,
  discountRateDiff,
}: any) {
  if (!width || !height || width <= 0 || height <= 0) return null;

  const safeYoy = typeof yoy === 'number' && Number.isFinite(yoy) ? yoy : null;
  const safePrevSales = typeof prevSales === 'number' && Number.isFinite(prevSales) ? prevSales : 0;
  const isNewStore = safePrevSales <= 0 && safeYoy !== null && safeYoy === 0;
  const safeDiscountRate = typeof discountRate === 'number' && Number.isFinite(discountRate) ? discountRate : null;
  const safeDiscountRateDiff =
    typeof discountRateDiff === 'number' && Number.isFinite(discountRateDiff) ? discountRateDiff : null;
  const isOnlineStore = channel === '온라인';
  const isOutletStore = channel === '아울렛';
  const isWarningStore = !isNewStore && safeYoy !== null && safeYoy < 100;

  const fill = isWarningStore
    ? '#fecaca'
    : isOnlineStore
      ? '#ddd6fe'
      : isOutletStore
        ? '#fde68a'
        : safeYoy === null
          ? '#e5e7eb'
          : '#bbf7d0';

  const border = isWarningStore
    ? '#fca5a5'
    : isOnlineStore
      ? '#a78bfa'
      : isOutletStore
        ? '#f59e0b'
        : safeYoy === null
          ? '#cbd5e1'
          : '#86efac';

  const yoyPrefix = language === 'ko' ? '실판 YoY' : 'Actual YoY';
  const yoyDisplayText = isNewStore
    ? language === 'ko'
      ? '실판 YoY 신규'
      : 'Actual YoY New'
    : `${yoyPrefix} ${safeYoy !== null ? `${safeYoy.toFixed(0)}%` : '-'}`;

  const showTitle = width >= 36 && height >= 22;
  const showYoy = width >= 92 && height >= 72;
  const showDiscount = width >= 118 && height >= 96;

  const discountDiffText =
    safeDiscountRateDiff === null
      ? '-'
      : safeDiscountRateDiff > 0
        ? `+${safeDiscountRateDiff.toFixed(1)}%p`
        : safeDiscountRateDiff < 0
          ? `-${Math.abs(safeDiscountRateDiff).toFixed(1)}%p`
          : '0.0%p';

  const discountDiffColor =
    safeDiscountRateDiff === null
      ? '#64748b'
      : safeDiscountRateDiff > 0
        ? '#dc2626'
        : safeDiscountRateDiff < 0
          ? '#16a34a'
          : '#64748b';

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={border} strokeWidth={1.5} rx={8} ry={8} />
      <foreignObject x={x} y={y} width={width} height={height}>
        <div
          style={{
            width: '100%',
            height: '100%',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            overflow: 'hidden',
            color: '#0f172a',
            fontFamily: 'Arial, sans-serif',
            lineHeight: 1.15,
            cursor: onStoreSelect ? 'pointer' : 'default',
          }}
          onClick={() => onStoreSelect?.(storeCode, fullName)}
        >
          {showTitle ? (
            <div
              style={{
                fontSize: width >= 110 ? '15px' : width >= 70 ? '13px' : '11px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </div>
          ) : null}
          {showYoy ? (
            <div
              style={{
                marginTop: showTitle ? '6px' : '0',
                fontSize: width >= 140 ? '16px' : '14px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {yoyDisplayText}
            </div>
          ) : null}
          {showDiscount && (
            <>
              <div
                style={{
                  marginTop: '6px',
                  fontSize: width >= 140 ? '13px' : '11px',
                  fontWeight: 700,
                  color: '#0369a1',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${language === 'ko' ? '할인율' : 'Discount'} ${safeDiscountRate !== null ? `${safeDiscountRate.toFixed(1)}%` : '-'}`}
              </div>
              <div
                style={{
                  marginTop: '4px',
                  fontSize: width >= 140 ? '12px' : '11px',
                  fontWeight: 700,
                  color: discountDiffColor,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {`${language === 'ko' ? '전년비' : 'vs LY'} ${discountDiffText}`}
              </div>
            </>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

function StoreTreemapTooltip({
  active,
  payload,
  language,
  formatCurrency,
}: {
  active?: boolean;
  payload?: any[];
  language: Language;
  formatCurrency: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;
  const safePrevSales = typeof item.prevSales === 'number' && Number.isFinite(item.prevSales) ? item.prevSales : 0;
  const isNewStore = safePrevSales <= 0 && typeof item.yoy === 'number' && Number.isFinite(item.yoy) && item.yoy === 0;
  const yoyText = isNewStore
    ? language === 'ko'
      ? '신규'
      : 'New'
    : typeof item.yoy === 'number' && Number.isFinite(item.yoy)
      ? `${item.yoy.toFixed(0)}%`
      : '-';

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-gray-900">{item.fullName}</p>
      <p className="mt-1 text-xs text-gray-600">
        {language === 'ko' ? '태그매출' : 'Tag Sales'}: {formatCurrency(item.tagSales)}
      </p>
      <p className="text-xs text-gray-600">
        {language === 'ko' ? '실판매출' : 'Actual Sales'}: {formatCurrency(item.sales)}
      </p>
      <p className="text-xs text-gray-600">
        {language === 'ko' ? '매출 비중' : 'Sales Share'}:{' '}
        {typeof item.share === 'number' && Number.isFinite(item.share) ? item.share.toFixed(1) : '0.0'}%
      </p>
      <p className="text-xs text-gray-600">
        {language === 'ko' ? '실판 YoY' : 'Actual YoY'}: {yoyText}
      </p>
      {item.channel ? (
        <p className="text-xs text-gray-600">
          {language === 'ko' ? '채널' : 'Channel'}: {item.channel}
        </p>
      ) : null}
    </div>
  );
}
