'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getCategoryTooltipText } from '@/lib/category-utils';
import { getExchangeRate, getPeriodFromDateString } from '@/lib/exchange-rate-utils';
import { type Language } from '@/lib/translations';

type RegionSalesSnapshot = {
  daily_yoy: number | null;
  same_store_daily_yoy: number | null;
  recent_7d_yoy: number | null;
  same_store_recent_7d_yoy: number | null;
  yoy: number | null;
  same_store_yoy: number | null;
  projected_mtd_yoy: number | null;
  same_store_projected_yoy: number | null;
  yoy_ytd: number | null;
  same_store_yoy_ytd: number | null;
  daily_yoy_trend: Array<{
    date: string;
    label: string;
    yoy: number | null;
    sales_act: number;
    sales_act_ly: number;
    daily_sales?: number;
    daily_sales_ly?: number;
  }>;
  same_store_daily_yoy_trend: Array<{
    date: string;
    label: string;
    yoy: number | null;
    sales_act: number;
    sales_act_ly: number;
    daily_sales?: number;
    daily_sales_ly?: number;
  }>;
  same_store_daily_yoy_trend_120d: Array<{
    date: string;
    label: string;
    yoy: number | null;
    sales_act: number;
    sales_act_ly: number;
    daily_sales?: number;
    daily_sales_ly?: number;
  }>;
  same_store_daily_yoy_trend_30d: Array<{
    date: string;
    label: string;
    yoy: number | null;
    sales_act: number;
    sales_act_ly: number;
    daily_sales?: number;
    daily_sales_ly?: number;
  }>;
  same_store_daily_yoy_trend_7d: Array<{
    date: string;
    label: string;
    yoy: number | null;
    sales_act: number;
    sales_act_ly: number;
    daily_sales?: number;
    daily_sales_ly?: number;
  }>;
};

type MetricRow = {
  key: string;
  metric: string;
  period: string;
  hkmcValue: number | null;
  twValue: number | null;
  isProjected?: boolean;
};

type PopupRegion = 'HKMC' | 'TW';

type StoreYoyDetailSelection = {
  metricKey: string;
  region: PopupRegion;
};

type StoreDetailSortKey =
  | 'shopCd'
  | 'shopName'
  | 'currentSales'
  | 'previousSales'
  | 'yoy'
  | 'discountRate'
  | 'discountRateDiff';
type StoreCategoryDetailSortKey =
  | 'middleCategory'
  | 'subcategory'
  | 'currentSales'
  | 'previousSales'
  | 'yoy'
  | 'discountRate'
  | 'discountRateDiff';

type StoreCategoryDetailSelection = {
  shopCd: string;
  shopName: string;
};

type StoreCategoryDetailRow = {
  middleCategory: string;
  subcategory: string;
  currentTagSales: number;
  previousTagSales: number;
  currentSales: number;
  previousSales: number;
  yoy: number | null;
  discountRate: number | null;
  discountRateDiff: number | null;
};

type StoreDetailRow = {
  shopCd: string;
  shopName: string;
  currentSales: number;
  previousSales: number;
  yoy: number | null;
  discountRate: number | null;
  discountRateDiff: number | null;
};

type StoreCategoryDetailPayload = {
  asof_date: string;
  period_start_date: string;
  mode: 'mtd' | 'ytd';
  metric_key?: 'daily' | 'recent7d' | 'mtd' | 'projectedMtd' | 'ytd';
  region: string;
  brand: string;
  categories: Array<{
    category: string;
    small_categories: Array<{
      category_small_key: string;
      category_small: string;
      middle_category: string;
      sales_tag: number;
      sales_tag_ly: number;
      sales_act: number;
      sales_act_ly: number;
      sales_act_yoy_pct: number | null;
      discount_rate: number | null;
      discount_rate_diff: number | null;
    }>;
  }>;
  header: {
    shop_cd: string;
    shop_name: string;
    sales_yoy_pct: number | null;
    discount_rate: number | null;
    discount_rate_diff: number | null;
  };
};

interface EntrySalesYoyPopupProps {
  brand: string;
  date: string;
  language: Language;
  hkmcSection1Data: any;
  twSection1Data: any;
  hkmcSection2Data?: any;
  twSection2Data?: any;
  hkmcSection3Data?: any;
  twSection3Data?: any;
  reopenKey?: number;
}

const STORAGE_KEY = 'dashboard-entry-sales-yoy-popup-hidden-on';
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getVisibilityKey(date: string) {
  return date || 'unknown-date';
}

function parseLocalDate(date: string) {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function shiftYears(date: Date, years: number) {
  const shifted = new Date(date);
  shifted.setFullYear(shifted.getFullYear() + years);
  return shifted;
}

function shiftDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function formatDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatMonthDay(date: Date) {
  return `${MONTH_EN[date.getMonth()]} ${date.getDate()}`;
}

function readRegionSnapshot(section1Data: any): RegionSalesSnapshot | null {
  const total = section1Data?.total_subtotal;
  if (!total) return null;

  return {
    daily_yoy:
      typeof total.daily_yoy === 'number' && Number.isFinite(total.daily_yoy) ? total.daily_yoy : null,
    same_store_daily_yoy:
      typeof total.same_store_daily_yoy === 'number' && Number.isFinite(total.same_store_daily_yoy)
        ? total.same_store_daily_yoy
        : null,
    recent_7d_yoy:
      typeof total.recent_7d_yoy === 'number' && Number.isFinite(total.recent_7d_yoy)
        ? total.recent_7d_yoy
        : null,
    same_store_recent_7d_yoy:
      typeof total.same_store_recent_7d_yoy === 'number' && Number.isFinite(total.same_store_recent_7d_yoy)
        ? total.same_store_recent_7d_yoy
        : null,
    yoy: typeof total.yoy === 'number' && Number.isFinite(total.yoy) ? total.yoy : null,
    same_store_yoy:
      typeof total.same_store_yoy === 'number' && Number.isFinite(total.same_store_yoy)
        ? total.same_store_yoy
        : null,
    projected_mtd_yoy:
      typeof total.projectedYoY === 'number' && Number.isFinite(total.projectedYoY)
        ? total.projectedYoY
        : null,
    same_store_projected_yoy:
      typeof total.same_store_projected_yoy === 'number' && Number.isFinite(total.same_store_projected_yoy)
        ? total.same_store_projected_yoy
        : null,
    yoy_ytd:
      typeof total.yoy_ytd === 'number' && Number.isFinite(total.yoy_ytd) ? total.yoy_ytd : null,
    same_store_yoy_ytd:
      typeof total.same_store_yoy_ytd === 'number' && Number.isFinite(total.same_store_yoy_ytd)
        ? total.same_store_yoy_ytd
        : null,
    daily_yoy_trend: Array.isArray(total.daily_yoy_trend) ? total.daily_yoy_trend : [],
    same_store_daily_yoy_trend: Array.isArray(total.same_store_daily_yoy_trend)
      ? total.same_store_daily_yoy_trend
      : [],
    same_store_daily_yoy_trend_120d: Array.isArray(total.same_store_daily_yoy_trend_120d)
      ? total.same_store_daily_yoy_trend_120d
      : [],
    same_store_daily_yoy_trend_30d: Array.isArray(total.same_store_daily_yoy_trend_30d)
      ? total.same_store_daily_yoy_trend_30d
      : [],
    same_store_daily_yoy_trend_7d: Array.isArray(total.same_store_daily_yoy_trend_7d)
      ? total.same_store_daily_yoy_trend_7d
      : [],
  };
}

function formatYoy(value: number | null) {
  return value === null ? '-' : `${Math.round(value)}%`;
}

function AnimatedYoyValue({
  value,
  toneClassName,
  delayMs = 0,
}: {
  value: number | null;
  toneClassName: string;
  delayMs?: number;
}) {
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    let frameId = 0;
    let revealFrameId = 0;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;

    setIsRevealed(false);

    if (value === null || !Number.isFinite(value)) {
      setDisplayValue(null);
      startTimeout = setTimeout(() => {
        revealFrameId = requestAnimationFrame(() => {
          revealFrameId = requestAnimationFrame(() => setIsRevealed(true));
        });
      }, delayMs);
      return () => {
        if (startTimeout) clearTimeout(startTimeout);
        cancelAnimationFrame(revealFrameId);
      };
    }

    const roundedTarget = Math.round(value);
    const startValue = 0;
    const duration = 1120;

    const tick = (startedAt: number, now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextValue = Math.round(startValue + (roundedTarget - startValue) * eased);

      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = requestAnimationFrame((nextNow) => tick(startedAt, nextNow));
      }
    };

    setDisplayValue(startValue);
    startTimeout = setTimeout(() => {
      revealFrameId = requestAnimationFrame(() => {
        revealFrameId = requestAnimationFrame(() => setIsRevealed(true));
      });
      frameId = requestAnimationFrame((now) => tick(now, now));
    }, delayMs);

    return () => {
      if (startTimeout) clearTimeout(startTimeout);
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(revealFrameId);
    };
  }, [delayMs, value]);

  return (
    <div
      className={`inline-flex items-center gap-1 whitespace-nowrap text-center text-lg font-bold tabular-nums transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:text-xl ${
        isRevealed ? 'translate-y-0 scale-100 blur-0 opacity-100' : 'translate-y-[14px] scale-[0.9] blur-[14px] opacity-0'
      } ${toneClassName}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-65"
      >
        <path d="M15 15l6 6" />
        <circle cx="10" cy="10" r="7" />
      </svg>
      {displayValue === null ? '-' : `${displayValue}%`}
    </div>
  );
}

function formatSalesAmount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatPercentValue(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

function formatPercentPointValue(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (value > 0) return `+${value.toFixed(digits)}%p`;
  if (value < 0) return `△${Math.abs(value).toFixed(digits)}%p`;
  return `0.${'0'.repeat(Math.max(digits, 1))}%p`;
}

function formatAmountInThousands(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value / 1000));
}

function getMiddleCategoryLabel(middleCategory: string) {
  const normalized = String(middleCategory || '').trim().toUpperCase();
  if (normalized === 'OUTER') return 'Outer';
  if (normalized === 'INNER') return 'Inner';
  if (normalized === 'BOTTOM') return 'Bottom';
  if (normalized === 'WEAR_ETC') return 'WTC';
  if (normalized === 'HEADWEAR') return 'Headwear';
  if (normalized === 'SHOES') return 'Shoes';
  if (normalized === 'BAG') return 'Bags';
  if (normalized === 'ACC_ETC' || normalized === 'ETC' || normalized === 'UNKNOWN') return 'ATC';
  return middleCategory;
}

function getRegionStores(section1Data: any, region: PopupRegion) {
  if (!section1Data || typeof section1Data !== 'object') return [];

  const storeGroups =
    region === 'TW'
      ? [section1Data.tw_normal, section1Data.tw_outlet, section1Data.tw_online]
      : [
          section1Data.hk_normal,
          section1Data.hk_outlet,
          section1Data.hk_online,
          section1Data.mc_normal,
          section1Data.mc_outlet,
          section1Data.mc_online,
        ];

  return storeGroups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .filter((store) => store && typeof store === 'object' && !String(store.shop_cd || '').includes('_TOTAL'));
}

const HKMC_ACCENT = {
  softText: 'text-gray-700',
  stroke: '#4B5563',
};

const TW_ACCENT = {
  softText: 'text-violet-700',
  stroke: '#A78BFA',
};

function formatTrendTooltipValue(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value)}%`;
}

function getTrendDomain(rows: Array<{ hkmcYoy: number | null; twYoy: number | null }>) {
  const values = rows.flatMap((row) => [row.hkmcYoy, row.twYoy]).filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return [80, 120] as const;

  const min = Math.min(...values, 100);
  const max = Math.max(...values, 100);
  const paddedMin = Math.floor((min - 5) / 5) * 5;
  const paddedMax = Math.ceil((max + 5) / 5) * 5;
  return [paddedMin, paddedMax] as const;
}

function getTrendDescription(window: 'all' | 'mtd' | '120d' | '30d' | '7d') {
  if (window === 'mtd') {
    return {
      ko: '당월 1일부터 각 날짜까지 누적 YoY 추이, 100% 기준선',
      en: 'Cumulative YoY from the first day of this month with 100% baseline',
    };
  }
  if (window === '120d') {
    return {
      ko: '최근 120일 시작일부터 각 날짜까지 누적 YoY 추이, 100% 기준선',
      en: 'Cumulative YoY from the last 120-day start with 100% baseline',
    };
  }
  if (window === '7d') {
    return {
      ko: '최근 7일 시작일부터 각 날짜까지 누적 YoY 추이, 100% 기준선',
      en: 'Cumulative YoY from the last 7-day start with 100% baseline',
    };
  }
  if (window === '30d') {
    return {
      ko: '최근 30일 시작일부터 각 날짜까지 누적 YoY 추이, 100% 기준선',
      en: 'Cumulative YoY from the last 30-day start with 100% baseline',
    };
  }
  return {
    ko: '1/1부터 각 날짜까지 누적 YoY 추이, 100% 기준선',
    en: 'Cumulative YoY from Jan 1 with 100% baseline',
  };
}

function getTrendTitle(window: 'all' | 'mtd' | '120d' | '30d' | '7d') {
  if (window === 'mtd') return 'MTD YoY Trend';
  if (window === '120d') return '120 Days YoY Trend';
  if (window === '30d') return '30 Days YoY Trend';
  if (window === '7d') return '7 Days YoY Trend';
  return 'YTD YoY Trend';
}

function getTrendWindowForMetric(metricKey: string): 'all' | 'mtd' | '30d' | '7d' | null {
  if (metricKey === 'ytd') return 'all';
  if (metricKey === 'mtd') return 'mtd';
  if (metricKey === 'projectedMtd') return null;
  return '7d';
}

function buildLabels(date: string) {
  const currentDate = parseLocalDate(date);

  if (!currentDate) {
    return {
      title: 'Highlights',
      asOf: date || '-',
      rows: [
        { key: 'daily', metric: 'Daily YoY', period: '-' },
        { key: 'recent7d', metric: 'Last 7 Days YoY', period: '-' },
        { key: 'mtd', metric: 'MTD YoY', period: '-' },
        { key: 'projectedMtd', metric: 'Projected MTD YoY', period: '-' },
        { key: 'ytd', metric: 'YTD YoY', period: '-' },
      ],
    };
  }

  const previousYearDate = shiftYears(currentDate, -1);
  const recent7dStart = shiftDays(currentDate, -6);

  return {
    title: `${formatMonthDay(currentDate)} Highlights`,
    asOf: `As of ${currentDate.getFullYear()}. ${currentDate.getMonth() + 1}. ${currentDate.getDate()}`,
    rows: [
      {
        key: 'daily',
        metric: 'Daily YoY',
        period: `This ${WEEKDAY_EN[currentDate.getDay()]} vs Last ${WEEKDAY_EN[previousYearDate.getDay()]}`,
      },
      {
        key: 'recent7d',
        metric: 'Last 7 Days YoY',
        period: `${formatMonthDay(recent7dStart)} - ${formatMonthDay(currentDate)}`,
      },
      {
        key: 'mtd',
        metric: 'MTD YoY',
        period: `${MONTH_EN[currentDate.getMonth()]} 1 - ${formatMonthDay(currentDate)}`,
      },
      {
        key: 'projectedMtd',
        metric: 'Projected MTD YoY',
        period: `Projected ${MONTH_EN[currentDate.getMonth()]} End`,
      },
      {
        key: 'ytd',
        metric: 'YTD YoY',
        period: `Jan 1 - ${formatMonthDay(currentDate)}`,
      },
    ],
  };
}

export default function EntrySalesYoyPopup({
  brand,
  date,
  language,
  hkmcSection1Data,
  twSection1Data,
  reopenKey = 0,
}: EntrySalesYoyPopupProps) {
  const [open, setOpen] = useState(false);
  const [yoyBasis, setYoyBasis] = useState<'sameStore' | 'overall'>('overall');
  const [trendWindow, setTrendWindow] = useState<'all' | 'mtd' | '120d' | '30d' | '7d'>('all');
  const [sameStoreTrendRows, setSameStoreTrendRows] = useState<
    Array<{ label: string; hkmcYoy: number | null; twYoy: number | null }>
  >([]);
  const [sameStoreYtdRows, setSameStoreYtdRows] = useState<
    Array<{ label: string; hkmcYoy: number | null; twYoy: number | null }>
  >([]);
  const [activeTrendPoint, setActiveTrendPoint] = useState<{
    label: string;
    hkmcYoy: number | null;
    twYoy: number | null;
  } | null>(null);
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<StoreYoyDetailSelection | null>(null);
  const [selectedStoreCategoryDetail, setSelectedStoreCategoryDetail] = useState<StoreCategoryDetailSelection | null>(null);
  const [storeCategoryDetailData, setStoreCategoryDetailData] = useState<StoreCategoryDetailPayload | null>(null);
  const [storeCategoryDetailLoading, setStoreCategoryDetailLoading] = useState(false);
  const [storeCategoryDetailError, setStoreCategoryDetailError] = useState('');
  const [twStoreDetailCurrency, setTwStoreDetailCurrency] = useState<'HKD' | 'TWD'>('HKD');
  const [showStoreSalesColumns, setShowStoreSalesColumns] = useState(false);
  const [showCategorySalesColumns, setShowCategorySalesColumns] = useState(false);
  const [storeDetailSort, setStoreDetailSort] = useState<{ key: StoreDetailSortKey; direction: 'asc' | 'desc' }>({
    key: 'currentSales',
    direction: 'desc',
  });
  const [storeCategoryDetailSort, setStoreCategoryDetailSort] = useState<{
    key: StoreCategoryDetailSortKey;
    direction: 'asc' | 'desc';
  }>({
    key: 'currentSales',
    direction: 'desc',
  });
  const [activeTrendPosition, setActiveTrendPosition] = useState<{
    x: number;
    y: number;
    placement: 'above' | 'below';
  } | null>(null);
  const lastDateRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const hkmcSnapshot = useMemo(() => readRegionSnapshot(hkmcSection1Data), [hkmcSection1Data]);
  const twSnapshot = useMemo(() => readRegionSnapshot(twSection1Data), [twSection1Data]);
  const labels = useMemo(() => buildLabels(date), [date]);
  const trendDescription = useMemo(() => getTrendDescription(trendWindow), [trendWindow]);
  const trendTitle = useMemo(() => getTrendTitle(trendWindow), [trendWindow]);
  const isReady = !!hkmcSnapshot && !!twSnapshot;
  const sameStoreYtdCardValue = useMemo(() => {
    const hkmcTrendLast = sameStoreYtdRows.at(-1);

    return {
      hkmc:
        typeof hkmcTrendLast?.hkmcYoy === 'number' && Number.isFinite(hkmcTrendLast.hkmcYoy)
          ? hkmcTrendLast.hkmcYoy
          : hkmcSnapshot?.same_store_yoy_ytd ?? null,
      tw:
        typeof hkmcTrendLast?.twYoy === 'number' && Number.isFinite(hkmcTrendLast.twYoy)
          ? hkmcTrendLast.twYoy
          : twSnapshot?.same_store_yoy_ytd ?? null,
    };
  }, [hkmcSnapshot, sameStoreYtdRows, twSnapshot]);
  const twdToHkdRate = useMemo(() => getExchangeRate(getPeriodFromDateString(date)), [date]);

  const rows = useMemo<MetricRow[]>(
    () => [
      {
        key: 'daily',
        metric: labels.rows[0].metric,
        period: labels.rows[0].period,
        hkmcValue: yoyBasis === 'sameStore' ? hkmcSnapshot?.same_store_daily_yoy ?? null : hkmcSnapshot?.daily_yoy ?? null,
        twValue: yoyBasis === 'sameStore' ? twSnapshot?.same_store_daily_yoy ?? null : twSnapshot?.daily_yoy ?? null,
      },
      {
        key: 'recent7d',
        metric: labels.rows[1].metric,
        period: labels.rows[1].period,
        hkmcValue:
          yoyBasis === 'sameStore' ? hkmcSnapshot?.same_store_recent_7d_yoy ?? null : hkmcSnapshot?.recent_7d_yoy ?? null,
        twValue:
          yoyBasis === 'sameStore' ? twSnapshot?.same_store_recent_7d_yoy ?? null : twSnapshot?.recent_7d_yoy ?? null,
      },
      {
        key: 'mtd',
        metric: labels.rows[2].metric,
        period: labels.rows[2].period,
        hkmcValue: yoyBasis === 'sameStore' ? hkmcSnapshot?.same_store_yoy ?? null : hkmcSnapshot?.yoy ?? null,
        twValue: yoyBasis === 'sameStore' ? twSnapshot?.same_store_yoy ?? null : twSnapshot?.yoy ?? null,
      },
      {
        key: 'projectedMtd',
        metric: labels.rows[3].metric,
        period: labels.rows[3].period,
        hkmcValue:
          yoyBasis === 'sameStore' ? hkmcSnapshot?.same_store_projected_yoy ?? null : hkmcSnapshot?.projected_mtd_yoy ?? null,
        twValue:
          yoyBasis === 'sameStore' ? twSnapshot?.same_store_projected_yoy ?? null : twSnapshot?.projected_mtd_yoy ?? null,
        isProjected: true,
      },
      {
        key: 'ytd',
        metric: labels.rows[4].metric,
        period: labels.rows[4].period,
        hkmcValue: yoyBasis === 'sameStore' ? sameStoreYtdCardValue.hkmc : hkmcSnapshot?.yoy_ytd ?? null,
        twValue: yoyBasis === 'sameStore' ? sameStoreYtdCardValue.tw : twSnapshot?.yoy_ytd ?? null,
      },
    ],
    [hkmcSnapshot, twSnapshot, labels.rows, yoyBasis, sameStoreYtdCardValue]
  );
  const groupedRows = useMemo(
    () => [
      { key: 'dailyGroup', rows: rows.slice(0, 2) },
      { key: 'mtdGroup', rows: rows.slice(2, 4) },
      { key: 'ytdGroup', rows: rows.slice(4, 5) },
    ],
    [rows]
  );

  useEffect(() => {
    if (!open || yoyBasis !== 'sameStore') {
      setSameStoreTrendRows([]);
      setSameStoreYtdRows([]);
      return;
    }

    let cancelled = false;

    const fetchRegionTrend = async (region: 'HKMC' | 'TW', window: 'all' | '120d' | '30d' | '7d') => {
      const query = new URLSearchParams({
        region,
        brand,
        date,
        window,
      });
      const response = await fetch(`/api/section1/same-store-yoy-trend?${query.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load ${region} same-store trend`);
      return response.json();
    };

    const mergeRegionRows = (hkmcResult: any, twResult: any) => {
      const twMap = new Map(
        Array.isArray(twResult?.rows) ? twResult.rows.map((row: any) => [String(row.label || ''), row]) : []
      );
      return Array.isArray(hkmcResult?.rows)
        ? hkmcResult.rows.map((row: any) => {
            const twRow: any = twMap.get(String(row.label || ''));
            return {
              label: String(row.label || ''),
              hkmcYoy: typeof row?.yoy === 'number' ? row.yoy : null,
              twYoy: typeof twRow?.yoy === 'number' ? twRow.yoy : null,
            };
          })
        : [];
    };

    const load = async () => {
      try {
        const fetchWindow = trendWindow === 'mtd' ? 'all' : trendWindow;
        const [hkmcResult, twResult, hkmcYtdResult, twYtdResult] = await Promise.all([
          fetchRegionTrend('HKMC', fetchWindow),
          fetchRegionTrend('TW', fetchWindow),
          fetchRegionTrend('HKMC', 'all'),
          fetchRegionTrend('TW', 'all'),
        ]);
        if (cancelled) return;

        setSameStoreTrendRows(mergeRegionRows(hkmcResult, twResult));
        setSameStoreYtdRows(mergeRegionRows(hkmcYtdResult, twYtdResult));
      } catch {
        if (!cancelled) {
          setSameStoreTrendRows([]);
          setSameStoreYtdRows([]);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, yoyBasis, trendWindow, brand, date]);

  const trendRows = useMemo(() => {
    if (yoyBasis === 'sameStore') {
      return sameStoreTrendRows.map((row) => ({
        date: row.label,
        label: row.label,
        hkmcYtdYoy: row.hkmcYoy,
        hkmcDailySales: 0,
        hkmcDailySalesLy: 0,
        twYtdYoy: row.twYoy,
        twDailySales: 0,
        twDailySalesLy: 0,
      }));
    }

    const hkmcTrend =
      hkmcSnapshot?.daily_yoy_trend || [];
    const twTrendMap = new Map(
      (twSnapshot?.daily_yoy_trend || []).map((item) => [item.date, item])
    );

    return hkmcTrend.map((item) => {
      const twItem = twTrendMap.get(item.date);
      return {
        date: item.date,
        label: item.label,
        hkmcYtdYoy: item.yoy,
        hkmcDailySales: item.daily_sales ?? 0,
        hkmcDailySalesLy: item.daily_sales_ly ?? 0,
        twYtdYoy: twItem?.yoy ?? null,
        twDailySales: twItem?.daily_sales ?? 0,
        twDailySalesLy: twItem?.daily_sales_ly ?? 0,
      };
    });
  }, [hkmcSnapshot, twSnapshot, yoyBasis, sameStoreTrendRows]);
  const visibleTrendRows = useMemo(() => {
    if (trendRows.length === 0) return [];

    if (yoyBasis === 'sameStore') {
      const parsedAsOfDate = parseLocalDate(date);
      const monthStartKey = parsedAsOfDate
        ? formatDateKey(new Date(parsedAsOfDate.getFullYear(), parsedAsOfDate.getMonth(), 1))
        : null;
      const sameStoreRows =
        trendWindow === 'mtd' && monthStartKey
          ? trendRows.filter((row) => row.date >= monthStartKey)
          : trendRows;

      return sameStoreRows.map((row) => ({
        label: row.label,
        hkmcYoy: row.hkmcYtdYoy ?? null,
        twYoy: row.twYtdYoy ?? null,
      }));
    }

    if (trendWindow === 'all') {
      const parsedAsOfDate = parseLocalDate(date);
      const ytdStartKey = parsedAsOfDate ? formatDateKey(new Date(parsedAsOfDate.getFullYear(), 0, 1)) : null;
      const ytdRows = ytdStartKey ? trendRows.filter((row) => row.date >= ytdStartKey) : trendRows;

      return ytdRows.map((row) => ({
        label: row.label,
        hkmcYoy: row.hkmcYtdYoy ?? null,
        twYoy: row.twYtdYoy ?? null,
      }));
    }

    if (trendWindow === 'mtd') {
      const parsedAsOfDate = parseLocalDate(date);
      const monthStartKey = parsedAsOfDate
        ? formatDateKey(new Date(parsedAsOfDate.getFullYear(), parsedAsOfDate.getMonth(), 1))
        : null;
      const mtdRows = monthStartKey ? trendRows.filter((row) => row.date >= monthStartKey) : trendRows;
      let hkmcMtdSales = 0;
      let hkmcMtdSalesLy = 0;
      let twMtdSales = 0;
      let twMtdSalesLy = 0;

      return mtdRows.map((row) => {
        hkmcMtdSales += row.hkmcDailySales;
        hkmcMtdSalesLy += row.hkmcDailySalesLy;
        twMtdSales += row.twDailySales;
        twMtdSalesLy += row.twDailySalesLy;

        return {
          label: row.label,
          hkmcYoy: hkmcMtdSalesLy > 0 ? (hkmcMtdSales / hkmcMtdSalesLy) * 100 : null,
          twYoy: twMtdSalesLy > 0 ? (twMtdSales / twMtdSalesLy) * 100 : null,
        };
      });
    }

    const windowSize = trendWindow === '7d' ? 7 : trendWindow === '30d' ? 30 : 120;
    const slicedRows = trendRows.slice(-windowSize);
    let hkmcWindowSales = 0;
    let hkmcWindowSalesLy = 0;
    let twWindowSales = 0;
    let twWindowSalesLy = 0;

    return slicedRows.map((row) => {
      hkmcWindowSales += row.hkmcDailySales;
      hkmcWindowSalesLy += row.hkmcDailySalesLy;
      twWindowSales += row.twDailySales;
      twWindowSalesLy += row.twDailySalesLy;

      return {
        label: row.label,
        hkmcYoy: hkmcWindowSalesLy > 0 ? (hkmcWindowSales / hkmcWindowSalesLy) * 100 : null,
        twYoy: twWindowSalesLy > 0 ? (twWindowSales / twWindowSalesLy) * 100 : null,
      };
    });
  }, [date, trendRows, trendWindow, yoyBasis]);
  const trendDomain = useMemo(() => getTrendDomain(visibleTrendRows), [visibleTrendRows]);
  const selectedMetricRow = useMemo(
    () => rows.find((row) => row.key === selectedStoreDetail?.metricKey) || null,
    [rows, selectedStoreDetail]
  );
  const storeDetailData = useMemo(() => {
    if (!selectedStoreDetail) return null;

    const sourceData = selectedStoreDetail.region === 'HKMC' ? hkmcSection1Data : twSection1Data;
    const stores = getRegionStores(sourceData, selectedStoreDetail.region);
    const isSameStore = yoyBasis === 'sameStore';
    const currentLabel =
      selectedMetricRow?.key === 'daily'
        ? (language === 'ko' ? '당일 매출액' : 'Current Sales')
        : selectedMetricRow?.key === 'recent7d'
          ? (language === 'ko' ? '최근 7일 매출액' : 'Current 7D Sales')
          : selectedMetricRow?.key === 'ytd'
            ? (language === 'ko' ? 'YTD 매출액' : 'YTD Sales')
            : (language === 'ko' ? '당월 매출액' : 'MTD Sales');
    const previousLabel =
      selectedMetricRow?.key === 'daily'
        ? (language === 'ko' ? '전년 동일 매출액' : 'LY Same Day Sales')
        : selectedMetricRow?.key === 'recent7d'
          ? (language === 'ko' ? '전년 동기 7일 매출액' : 'LY Same 7D Sales')
          : selectedMetricRow?.key === 'ytd'
            ? (language === 'ko' ? '전년 YTD 매출액' : 'LY YTD Sales')
            : (language === 'ko' ? '전년 동월 매출액' : 'LY MTD Sales');

    const rows = stores
      .map((store: any): StoreDetailRow | null => {
        let currentSales = 0;
        let previousSales = 0;
        const useYtdDiscount = selectedStoreDetail.metricKey === 'ytd';

        if (selectedStoreDetail.metricKey === 'daily') {
          currentSales = Number(store?.daily_act || 0);
          previousSales = Number(store?.daily_act_py || 0);
        } else if (selectedStoreDetail.metricKey === 'recent7d') {
          currentSales = Number(store?.recent_7d_act || 0);
          previousSales = Number(store?.recent_7d_act_py || 0);
        } else if (selectedStoreDetail.metricKey === 'ytd') {
          currentSales = Number(store?.ytd_act || 0);
          previousSales = Number(store?.ytd_act_py || 0);
        } else {
          currentSales = Number(store?.mtd_act || 0);
          previousSales = Number(store?.mtd_act_py || 0);
        }

        const excludeByZeroSalesRule =
          (selectedStoreDetail.metricKey === 'mtd' || selectedStoreDetail.metricKey === 'projectedMtd') &&
          typeof store?.mtd_zero_sales_days === 'number' &&
          store.mtd_zero_sales_days >= 5;
        const isEligibleSameStore = currentSales > 0 && previousSales > 0 && !excludeByZeroSalesRule;
        const shouldInclude = isSameStore ? isEligibleSameStore : currentSales > 0 || previousSales > 0;
        if (!shouldInclude) return null;

        return {
          shopCd: String(store?.shop_cd || ''),
          shopName: String(store?.shop_name || store?.shop_cd || ''),
          currentSales,
          previousSales,
          yoy: previousSales > 0 ? (currentSales / previousSales) * 100 : null,
          discountRate: Number(
            useYtdDiscount ? store?.discount_rate_ytd ?? store?.ytd_discount_rate ?? 0 : store?.discount_rate_mtd ?? 0
          ),
          discountRateDiff: Number(
            useYtdDiscount
              ? store?.discount_rate_ytd_diff ?? store?.ytd_discount_rate_diff ?? 0
              : store?.discount_rate_mtd_diff ?? 0
          ),
        };
      })
      .filter((row): row is StoreDetailRow => row !== null)
      .sort((a, b) => b.currentSales - a.currentSales || a.shopCd.localeCompare(b.shopCd));

    const currentTotal = rows.reduce((sum, row) => sum + row.currentSales, 0);
    const previousTotal = rows.reduce((sum, row) => sum + row.previousSales, 0);
    const discountWeight = rows.reduce((sum, row) => sum + Math.max(row.currentSales, 0), 0);
    const totalDiscountRate =
      discountWeight > 0
        ? rows.reduce((sum, row) => sum + (row.discountRate ?? 0) * Math.max(row.currentSales, 0), 0) / discountWeight
        : null;
    const totalDiscountRateDiff =
      discountWeight > 0
        ? rows.reduce((sum, row) => sum + (row.discountRateDiff ?? 0) * Math.max(row.currentSales, 0), 0) / discountWeight
        : null;

    return {
      region: selectedStoreDetail.region,
      metricLabel: selectedMetricRow?.metric || '',
      periodLabel: selectedMetricRow?.period || '',
      currentLabel,
      previousLabel,
      rows,
      currentTotal,
      previousTotal,
      totalDiscountRate,
      totalDiscountRateDiff,
      totalYoy: previousTotal > 0 ? (currentTotal / previousTotal) * 100 : null,
    };
  }, [hkmcSection1Data, language, selectedMetricRow, selectedStoreDetail, twSection1Data, yoyBasis]);

  useEffect(() => {
    setActiveTrendPoint(null);
    setActiveTrendPosition(null);
  }, [visibleTrendRows]);

  useEffect(() => {
    setSelectedStoreDetail(null);
  }, [date, yoyBasis]);

  useEffect(() => {
    setShowStoreSalesColumns(false);
    setSelectedStoreCategoryDetail(null);
    setStoreCategoryDetailData(null);
    setStoreCategoryDetailError('');
  }, [selectedStoreDetail?.metricKey, selectedStoreDetail?.region, date, yoyBasis]);

  useEffect(() => {
    setShowCategorySalesColumns(false);
  }, [selectedStoreCategoryDetail?.shopCd]);

  useEffect(() => {
    if (selectedStoreDetail?.region !== 'TW') {
      setTwStoreDetailCurrency('HKD');
    }
  }, [selectedStoreDetail?.region]);

  useEffect(() => {
    setStoreDetailSort({ key: 'currentSales', direction: 'desc' });
  }, [selectedStoreDetail?.metricKey, selectedStoreDetail?.region]);

  useEffect(() => {
    setStoreCategoryDetailSort({ key: 'currentSales', direction: 'desc' });
  }, [selectedStoreCategoryDetail?.shopCd]);

  const sortedStoreDetailRows = useMemo(() => {
    if (!storeDetailData) return [];

    return [...storeDetailData.rows].sort((a, b) => {
      const left = a[storeDetailSort.key];
      const right = b[storeDetailSort.key];

      if (typeof left === 'string' || typeof right === 'string') {
        const result = String(left || '').localeCompare(String(right || ''));
        return storeDetailSort.direction === 'asc' ? result : -result;
      }

      const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
      const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
      if (leftValue === rightValue) {
        return a.shopCd.localeCompare(b.shopCd);
      }
      return storeDetailSort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [storeDetailData, storeDetailSort]);

  useEffect(() => {
    if (!selectedStoreDetail || !selectedStoreCategoryDetail) return;

    let active = true;
    const controller = new AbortController();

    const loadStoreCategoryDetail = async () => {
      setStoreCategoryDetailLoading(true);
      setStoreCategoryDetailError('');

      try {
        const params = new URLSearchParams({
          region: selectedStoreDetail.region,
          brand,
          date,
          shop_cd: selectedStoreCategoryDetail.shopCd,
          mode: selectedStoreDetail.metricKey === 'ytd' ? 'ytd' : 'mtd',
          metric_key: selectedStoreDetail.metricKey,
        });

        const response = await fetch(`/api/section1/store-detail?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json?.message || json?.error || 'Failed to fetch store category detail');
        }
        if (!active) return;
        setStoreCategoryDetailData(json);
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        if (!active) return;
        setStoreCategoryDetailError(error?.message || 'Failed to fetch store category detail');
        setStoreCategoryDetailData(null);
      } finally {
        if (active) setStoreCategoryDetailLoading(false);
      }
    };

    void loadStoreCategoryDetail();

    return () => {
      active = false;
      controller.abort();
    };
  }, [brand, date, selectedStoreCategoryDetail, selectedStoreDetail]);

  const storeCategoryRows = useMemo<StoreCategoryDetailRow[]>(() => {
    if (!storeCategoryDetailData) return [];

    const mergedRows = new Map<
      string,
      StoreCategoryDetailRow
    >();

    storeCategoryDetailData.categories.forEach((category) => {
      (Array.isArray(category.small_categories) ? category.small_categories : []).forEach((smallCategory) => {
        const middleCategory = smallCategory.middle_category;
        const subcategory = smallCategory.category_small;
        const currentTagSales = Number(smallCategory.sales_tag || 0);
        const previousTagSales = Number(smallCategory.sales_tag_ly || 0);
        const currentSales = Number(smallCategory.sales_act || 0);
        const previousSales = Number(smallCategory.sales_act_ly || 0);
        const rowKey = `${middleCategory}__${subcategory}`;
        const existing = mergedRows.get(rowKey);
        const currentDiscountRate = currentTagSales > 0 ? (1 - currentSales / currentTagSales) * 100 : null;
        const previousDiscountRate = previousTagSales > 0 ? (1 - previousSales / previousTagSales) * 100 : null;

        if (!existing) {
          mergedRows.set(rowKey, {
            middleCategory,
            subcategory,
            currentTagSales,
            previousTagSales,
            currentSales,
            previousSales,
            yoy: null,
            discountRate: currentDiscountRate,
            discountRateDiff:
              currentDiscountRate !== null && previousDiscountRate !== null
                ? currentDiscountRate - previousDiscountRate
                : null,
          });
          return;
        }

        existing.currentTagSales += currentTagSales;
        existing.previousTagSales += previousTagSales;
        existing.currentSales += currentSales;
        existing.previousSales += previousSales;
      });
    });

    return Array.from(mergedRows.values())
      .map((row) => {
        const mergedCurrentDiscountRate = row.currentTagSales > 0 ? (1 - row.currentSales / row.currentTagSales) * 100 : null;
        const mergedPreviousDiscountRate = row.previousTagSales > 0 ? (1 - row.previousSales / row.previousTagSales) * 100 : null;

        return {
          ...row,
          yoy: row.previousSales > 0 ? (row.currentSales / row.previousSales) * 100 : null,
          discountRate: mergedCurrentDiscountRate,
          discountRateDiff:
            mergedCurrentDiscountRate !== null && mergedPreviousDiscountRate !== null
              ? mergedCurrentDiscountRate - mergedPreviousDiscountRate
              : null,
        };
      })
      .filter((row) => row.currentSales > 0 || row.previousSales > 0)
      .sort((a, b) => b.currentSales - a.currentSales || a.subcategory.localeCompare(b.subcategory));
  }, [storeCategoryDetailData]);

  const sortedStoreCategoryRows = useMemo(() => {
    return [...storeCategoryRows].sort((a, b) => {
      const left = a[storeCategoryDetailSort.key];
      const right = b[storeCategoryDetailSort.key];

      if (typeof left === 'string' || typeof right === 'string') {
        const result = String(left || '').localeCompare(String(right || ''));
        return storeCategoryDetailSort.direction === 'asc' ? result : -result;
      }

      const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
      const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
      if (leftValue === rightValue) {
        return a.subcategory.localeCompare(b.subcategory);
      }
      return storeCategoryDetailSort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [storeCategoryRows, storeCategoryDetailSort]);

  const storeCategoryTotals = useMemo(() => {
    const currentSales = storeCategoryRows.reduce((sum, row) => sum + row.currentSales, 0);
    const previousSales = storeCategoryRows.reduce((sum, row) => sum + row.previousSales, 0);
    const currentTagSales = storeCategoryRows.reduce((sum, row) => sum + row.currentTagSales, 0);
    const previousTagSales = storeCategoryRows.reduce((sum, row) => sum + row.previousTagSales, 0);
    const discountRate = currentTagSales > 0 ? (1 - currentSales / currentTagSales) * 100 : null;
    const previousDiscountRate = previousTagSales > 0 ? (1 - previousSales / previousTagSales) * 100 : null;

    return {
      currentSales,
      previousSales,
      yoy: previousSales > 0 ? (currentSales / previousSales) * 100 : null,
      discountRate,
      discountRateDiff:
        discountRate !== null && previousDiscountRate !== null
          ? discountRate - previousDiscountRate
          : null,
    };
  }, [storeCategoryRows]);

  const formatStoreDetailAmount = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    if (storeDetailData?.region === 'TW' && twStoreDetailCurrency === 'TWD' && twdToHkdRate > 0) {
      return formatSalesAmount(value / twdToHkdRate);
    }
    return formatSalesAmount(value);
  };

  const formatStoreDetailAmountInThousands = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    const converted =
      storeDetailData?.region === 'TW' && twStoreDetailCurrency === 'TWD' && twdToHkdRate > 0
        ? value / twdToHkdRate
        : value;
    return formatAmountInThousands(converted);
  };

  const toggleStoreDetailSort = (key: StoreDetailSortKey) => {
    setStoreDetailSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'shopCd' || key === 'shopName' ? 'asc' : 'desc' }
    );
  };

  const getStoreDetailSortIndicator = (key: StoreDetailSortKey) => {
    if (storeDetailSort.key !== key) return '';
    return storeDetailSort.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const toggleStoreCategoryDetailSort = (key: StoreCategoryDetailSortKey) => {
    setStoreCategoryDetailSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'middleCategory' || key === 'subcategory' ? 'asc' : 'desc' }
    );
  };

  const getStoreCategoryDetailSortIndicator = (key: StoreCategoryDetailSortKey) => {
    if (storeCategoryDetailSort.key !== key) return '';
    return storeCategoryDetailSort.direction === 'asc' ? ' ▲' : ' ▼';
  };

  useEffect(() => {
    const previousDate = lastDateRef.current;
    lastDateRef.current = date;

    if (previousDate !== null && previousDate !== date) {
      setOpen(true);
      setYoyBasis('overall');
      setTrendWindow('all');
    }
  }, [date]);

  useEffect(() => {
    if (!isReady || initializedRef.current) return;
    initializedRef.current = true;

    const hiddenOn = window.localStorage.getItem(STORAGE_KEY);
    setOpen(hiddenOn !== getVisibilityKey(date));
  }, [date, isReady]);

  useEffect(() => {
    if (!isReady || !reopenKey) return;
    setOpen(true);
  }, [isReady, reopenKey]);

  if (!open || !isReady) return null;

  const handleCloseForToday = () => {
    window.localStorage.setItem(STORAGE_KEY, getVisibilityKey(date));
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/50 px-3 sm:px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-[680px] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {storeDetailData ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 px-4 py-4 backdrop-blur-[1px]"
            onClick={() => setSelectedStoreDetail(null)}
          >
            <div
              className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              {selectedStoreCategoryDetail ? (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center bg-white/88 px-4 py-4 backdrop-blur-[1px]"
                  onClick={() => setSelectedStoreCategoryDetail(null)}
                >
                  <div
                    className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {selectedStoreCategoryDetail.shopName} ({selectedStoreCategoryDetail.shopCd})
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {storeDetailData.periodLabel} · {yoyBasis === 'sameStore' ? 'Same Store' : 'Overall'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          Unit: 1K {storeDetailData.region === 'TW' ? twStoreDetailCurrency : 'HKD'}
                          {storeDetailData.region === 'TW' && twStoreDetailCurrency === 'TWD' && twdToHkdRate > 0
                            ? ` · Rate ${twdToHkdRate.toFixed(4)}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCategorySalesColumns((prev) => !prev)}
                        className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
                      >
                        {showCategorySalesColumns ? 'Hide Sales' : 'Show Sales'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStoreCategoryDetail(null)}
                        className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
                      >
                        {language === 'ko' ? '닫기' : 'Close'}
                      </button>
                    </div>
                    <div className="max-h-[420px] overflow-auto">
                      {storeCategoryDetailLoading ? (
                        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                          {language === 'ko' ? '로딩 중...' : 'Loading...'}
                        </div>
                      ) : storeCategoryDetailError ? (
                        <div className="flex h-48 items-center justify-center text-sm font-medium text-rose-500">
                          {storeCategoryDetailError}
                        </div>
                      ) : (
                        <table className="min-w-full table-fixed text-sm">
                          <thead className="sticky top-0 bg-gray-50 text-gray-700">
                            <tr className="border-b border-gray-200">
                              <th className="w-[20%] px-3 py-2 text-left font-semibold">
                                <button
                                  type="button"
                                  onClick={() => toggleStoreCategoryDetailSort('middleCategory')}
                                  className="inline-flex items-center gap-1"
                                >
                                  Middle Category{getStoreCategoryDetailSortIndicator('middleCategory')}
                                </button>
                              </th>
                              <th className="w-[14%] px-3 py-2 text-left font-semibold">
                                <button
                                  type="button"
                                  onClick={() => toggleStoreCategoryDetailSort('subcategory')}
                                  className="inline-flex items-center gap-1"
                                >
                                  Subcategory{getStoreCategoryDetailSortIndicator('subcategory')}
                                </button>
                              </th>
                              {showCategorySalesColumns ? (
                                <>
                                  <th className="w-[16%] px-3 py-2 text-right font-semibold">
                                    <button
                                      type="button"
                                      onClick={() => toggleStoreCategoryDetailSort('currentSales')}
                                      className="inline-flex w-full items-center justify-end gap-1 text-right"
                                    >
                                      Current Sales{getStoreCategoryDetailSortIndicator('currentSales')}
                                    </button>
                                  </th>
                                  <th className="w-[16%] px-3 py-2 text-right font-semibold">
                                    <button
                                      type="button"
                                      onClick={() => toggleStoreCategoryDetailSort('previousSales')}
                                      className="inline-flex w-full items-center justify-end gap-1 text-right"
                                    >
                                      LY Sales{getStoreCategoryDetailSortIndicator('previousSales')}
                                    </button>
                                  </th>
                                </>
                              ) : null}
                              <th className={`${showCategorySalesColumns ? 'w-[10%]' : 'w-[15%]'} px-3 py-2 text-right font-semibold`}>
                                <button
                                  type="button"
                                  onClick={() => toggleStoreCategoryDetailSort('yoy')}
                                  className="inline-flex w-full items-center justify-end gap-1 text-right"
                                >
                                  YoY{getStoreCategoryDetailSortIndicator('yoy')}
                                </button>
                              </th>
                              <th className={`${showCategorySalesColumns ? 'w-[12%]' : 'w-[16%]'} px-3 py-2 text-right font-semibold`}>
                                <button
                                  type="button"
                                  onClick={() => toggleStoreCategoryDetailSort('discountRate')}
                                  className="inline-flex w-full items-center justify-end gap-1 text-right"
                                >
                                  Disc. Rate{getStoreCategoryDetailSortIndicator('discountRate')}
                                </button>
                              </th>
                              <th className={`${showCategorySalesColumns ? 'w-[12%]' : 'w-[19%]'} px-3 py-2 text-right font-semibold`}>
                                <button
                                  type="button"
                                  onClick={() => toggleStoreCategoryDetailSort('discountRateDiff')}
                                  className="inline-flex w-full items-center justify-end gap-1 text-right"
                                >
                                  Disc. vs LY (%p){getStoreCategoryDetailSortIndicator('discountRateDiff')}
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-200 bg-slate-50/90">
                              <td className="px-3 py-2 font-semibold text-gray-900" colSpan={2}>
                                {language === 'ko' ? '합계' : 'Total'}
                              </td>
                              {showCategorySalesColumns ? (
                                <>
                                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                    {formatStoreDetailAmountInThousands(storeCategoryTotals.currentSales)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                    {formatStoreDetailAmountInThousands(storeCategoryTotals.previousSales)}
                                  </td>
                                </>
                              ) : null}
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                {formatYoy(storeCategoryTotals.yoy)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold italic tabular-nums text-sky-700">
                                {formatPercentValue(storeCategoryTotals.discountRate)}
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${storeCategoryTotals.discountRateDiff === null ? 'text-gray-400' : storeCategoryTotals.discountRateDiff > 0 ? 'text-rose-600' : storeCategoryTotals.discountRateDiff < 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                                {formatPercentPointValue(storeCategoryTotals.discountRateDiff)}
                              </td>
                            </tr>
                            {sortedStoreCategoryRows.map((row) => (
                              <tr key={`${selectedStoreCategoryDetail.shopCd}-${row.subcategory}`} className="border-b border-gray-100 last:border-b-0">
                                <td className="px-3 py-2 text-gray-700">{getMiddleCategoryLabel(row.middleCategory)}</td>
                                <td className="px-3 py-2 font-medium text-gray-900" title={getCategoryTooltipText(row.subcategory)}>
                                  {row.subcategory}
                                </td>
                                {showCategorySalesColumns ? (
                                  <>
                                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatStoreDetailAmountInThousands(row.currentSales)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatStoreDetailAmountInThousands(row.previousSales)}</td>
                                  </>
                                ) : null}
                                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.yoy === null ? 'text-gray-400' : row.yoy >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {formatYoy(row.yoy)}
                                </td>
                                <td className="px-3 py-2 text-right italic tabular-nums text-sky-700">{formatPercentValue(row.discountRate)}</td>
                                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.discountRateDiff === null ? 'text-gray-400' : row.discountRateDiff > 0 ? 'text-rose-600' : row.discountRateDiff < 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                                  {formatPercentPointValue(row.discountRateDiff)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {storeDetailData.region} · {storeDetailData.metricLabel}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {storeDetailData.periodLabel} · {yoyBasis === 'sameStore' ? 'Same Store' : 'Overall'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Unit: 1K {storeDetailData.region === 'TW' ? twStoreDetailCurrency : 'HKD'}
                    {storeDetailData.region === 'TW' && twStoreDetailCurrency === 'TWD' && twdToHkdRate > 0
                      ? ` · Rate ${twdToHkdRate.toFixed(4)}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {storeDetailData.region === 'TW' ? (
                    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setTwStoreDetailCurrency('HKD')}
                        className={`px-3 py-1 transition-colors ${
                          twStoreDetailCurrency === 'HKD'
                            ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        HKD
                      </button>
                      <button
                        type="button"
                        onClick={() => setTwStoreDetailCurrency('TWD')}
                        className={`border-l border-gray-200 px-3 py-1 transition-colors ${
                          twStoreDetailCurrency === 'TWD'
                            ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        TWD
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowStoreSalesColumns((prev) => !prev)}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    {showStoreSalesColumns ? 'Hide Sales' : 'Show Sales'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStoreDetail(null)}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    {language === 'ko' ? '닫기' : 'Close'}
                  </button>
                </div>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-gray-700">
                    <tr className="border-b border-gray-200">
                      <th className="w-[16%] px-3 py-2 text-left font-semibold">
                        <button type="button" onClick={() => toggleStoreDetailSort('shopCd')} className="inline-flex items-center gap-1">
                          Shop Code{getStoreDetailSortIndicator('shopCd')}
                        </button>
                      </th>
                      <th className="w-[22%] px-3 py-2 text-left font-semibold">
                        <button type="button" onClick={() => toggleStoreDetailSort('shopName')} className="inline-flex items-center gap-1">
                          Shop Name{getStoreDetailSortIndicator('shopName')}
                        </button>
                      </th>
                      {showStoreSalesColumns ? (
                        <>
                          <th className="w-[15%] px-3 py-2 text-right font-semibold">
                            <button type="button" onClick={() => toggleStoreDetailSort('currentSales')} className="inline-flex w-full items-center justify-end gap-1 text-right">
                              Current Sales{getStoreDetailSortIndicator('currentSales')}
                            </button>
                          </th>
                          <th className="w-[15%] px-3 py-2 text-right font-semibold">
                            <button type="button" onClick={() => toggleStoreDetailSort('previousSales')} className="inline-flex w-full items-center justify-end gap-1 text-right">
                              LY Sales{getStoreDetailSortIndicator('previousSales')}
                            </button>
                          </th>
                        </>
                      ) : null}
                      <th className={`${showStoreSalesColumns ? 'w-[10%]' : 'w-[15%]'} px-3 py-2 text-right font-semibold`}>
                        <button type="button" onClick={() => toggleStoreDetailSort('yoy')} className="inline-flex w-full items-center justify-end gap-1 text-right">
                          YoY{getStoreDetailSortIndicator('yoy')}
                        </button>
                      </th>
                      <th className={`${showStoreSalesColumns ? 'w-[11%]' : 'w-[18%]'} px-3 py-2 text-right font-semibold`}>
                        <button type="button" onClick={() => toggleStoreDetailSort('discountRate')} className="inline-flex w-full items-center justify-end gap-1 text-right">
                          Disc. Rate{getStoreDetailSortIndicator('discountRate')}
                        </button>
                      </th>
                      <th className={`${showStoreSalesColumns ? 'w-[11%]' : 'w-[19%]'} px-3 py-2 text-right font-semibold`}>
                        <button type="button" onClick={() => toggleStoreDetailSort('discountRateDiff')} className="inline-flex w-full items-center justify-end gap-1 text-right">
                          Disc. vs LY (%p){getStoreDetailSortIndicator('discountRateDiff')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200 bg-slate-50/90">
                      <td className="px-3 py-2 font-semibold text-gray-900" colSpan={2}>
                        {language === 'ko' ? '합계' : 'Total'}
                      </td>
                      {showStoreSalesColumns ? (
                        <>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                            {formatStoreDetailAmountInThousands(storeDetailData.currentTotal)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                            {formatStoreDetailAmountInThousands(storeDetailData.previousTotal)}
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                        {formatYoy(storeDetailData.totalYoy)}
                      </td>
                        <td className="px-3 py-2 text-right font-semibold italic tabular-nums text-gray-900">
                          {formatPercentValue(storeDetailData.totalDiscountRate)}
                        </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                        {formatPercentPointValue(storeDetailData.totalDiscountRateDiff)}
                      </td>
                    </tr>
                    {sortedStoreDetailRows.map((detailRow) => (
                      <tr
                        key={`${storeDetailData.region}-${detailRow.shopCd}`}
                        onClick={() => setSelectedStoreCategoryDetail({ shopCd: detailRow.shopCd, shopName: detailRow.shopName })}
                        className="group cursor-pointer border-b border-gray-100 transition hover:bg-slate-50/80 last:border-b-0"
                      >
                        <td className="px-3 py-2 font-medium text-gray-800">{detailRow.shopCd}</td>
                        <td className="px-3 py-2 text-gray-700">
                          <div className="inline-flex items-center gap-1.5">
                            <span>{detailRow.shopName}</span>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="shrink-0 text-gray-400 transition group-hover:text-violet-500"
                              aria-hidden="true"
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </div>
                        </td>
                        {showStoreSalesColumns ? (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatStoreDetailAmountInThousands(detailRow.currentSales)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatStoreDetailAmountInThousands(detailRow.previousSales)}</td>
                          </>
                        ) : null}
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${detailRow.yoy === null ? 'text-gray-400' : detailRow.yoy >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatYoy(detailRow.yoy)}
                        </td>
                        <td className="px-3 py-2 text-right italic tabular-nums text-sky-700">
                          {formatPercentValue(detailRow.discountRate)}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${detailRow.discountRateDiff === null ? 'text-gray-400' : detailRow.discountRateDiff > 0 ? 'text-rose-600' : detailRow.discountRateDiff < 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                          {formatPercentPointValue(detailRow.discountRateDiff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.15em] text-emerald-600">SALES YOY SNAPSHOT</p>
            <h2 className="mt-0.5 text-lg font-bold text-gray-900">{labels.title}</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{brand === 'M' ? 'MLB' : brand}</p>
            <p className="mt-0.5 text-xs text-gray-400">{labels.asOf}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="팝업 닫기"
            className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div className="px-4 pb-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-h-10 items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100/80">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M15 15l6 6" />
                  <circle cx="10" cy="10" r="7" />
                </svg>
                <span>
                  {language === 'ko'
                    ? 'YOY율 클릭 시 매장별 상세 확인 가능 / Click any YoY badge to open store-level details.'
                    : 'Click any YoY badge to open store-level details. / YOY율 클릭 시 매장별 상세 확인 가능'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setYoyBasis('overall')}
                className={`px-3 py-1 transition-colors ${
                  yoyBasis === 'overall' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Overall
              </button>
              <button
                type="button"
                onClick={() => setYoyBasis('sameStore')}
                className={`border-l border-gray-200 px-3 py-1 transition-colors ${
                  yoyBasis === 'sameStore' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Same Store
              </button>
            </div>
            </div>
          </div>
          <div className="mb-2.5 grid grid-cols-[minmax(0,1fr)_92px_92px] items-center gap-x-3 px-1">
            <div className="text-left text-[11px] font-semibold text-gray-400">
              Metric
              <span className="ml-2 font-medium text-gray-300">|</span>
              <span className="ml-2 font-medium text-gray-500">{yoyBasis === 'sameStore' ? '동매장 기준' : '전체 기준'}</span>
            </div>
            <div className="flex h-10 items-center justify-center rounded-xl bg-gray-100 text-lg font-bold text-gray-700 ring-1 ring-gray-300/70 sm:text-xl">HKMC</div>
            <div className="flex h-10 items-center justify-center rounded-xl bg-violet-50 text-lg font-bold text-violet-700 ring-1 ring-violet-200/60 sm:text-xl">TW</div>
          </div>

          <div className="space-y-2.5">
            {groupedRows.map((group) => (
              <div key={group.key} className="rounded-2xl bg-slate-50/85 px-3 py-1.5 ring-1 ring-slate-200/80">
                {group.rows.map((row, index) => (
                  (() => {
                    const isProjectedDetailDisabled = row.key === 'projectedMtd';
                    const linkedTrendWindow = getTrendWindowForMetric(row.key);
                    const hkmcSelected =
                      selectedStoreDetail?.metricKey === row.key && selectedStoreDetail?.region === 'HKMC';
                    const twSelected =
                      selectedStoreDetail?.metricKey === row.key && selectedStoreDetail?.region === 'TW';

                    return (
                  <div
                    key={row.key}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_92px_92px] items-stretch gap-x-3 rounded-xl py-2 ${
                      index < group.rows.length - 1 ? 'border-b border-white/80' : ''
                    } ${
                      linkedTrendWindow !== null && linkedTrendWindow === trendWindow ? 'bg-white/65' : 'hover:bg-white/45'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (linkedTrendWindow !== null) setTrendWindow(linkedTrendWindow);
                      }}
                      className={`pr-1 text-left ${linkedTrendWindow === null ? 'cursor-default' : ''}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="text-[13px] font-semibold leading-tight text-gray-800">{row.metric}</div>
                        {row.isProjected ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-200/70">
                            Forecast
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] leading-snug text-gray-400">{row.period}</div>
                    </button>
                    {isProjectedDetailDisabled ? (
                      <>
                        <div
                          className="flex cursor-not-allowed items-center justify-center rounded-xl bg-white/70 opacity-75 ring-1 ring-slate-200/70"
                          title={language === 'ko' ? 'Projection 상세는 아직 지원되지 않습니다.' : 'Projected detail is not available yet.'}
                        >
                          <AnimatedYoyValue
                            value={row.hkmcValue}
                            delayMs={index * 110}
                            toneClassName={row.hkmcValue === null ? 'text-gray-400' : row.hkmcValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}
                          />
                        </div>
                        <div
                          className="flex cursor-not-allowed items-center justify-center rounded-xl bg-violet-50/45 opacity-75 ring-1 ring-violet-100"
                          title={language === 'ko' ? 'Projection 상세는 아직 지원되지 않습니다.' : 'Projected detail is not available yet.'}
                        >
                          <AnimatedYoyValue
                            value={row.twValue}
                            delayMs={index * 110 + 60}
                            toneClassName={row.twValue === null ? 'text-gray-400' : row.twValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedStoreDetail({ metricKey: row.key, region: 'HKMC' })}
                          className={`flex items-center justify-center rounded-xl bg-white/85 ring-1 ring-slate-200/80 transition ${
                            hkmcSelected ? 'ring-2 ring-gray-400' : 'hover:bg-white'
                          }`}
                        >
                          <AnimatedYoyValue
                            value={row.hkmcValue}
                            delayMs={index * 110}
                            toneClassName={row.hkmcValue === null ? 'text-gray-400' : row.hkmcValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStoreDetail({ metricKey: row.key, region: 'TW' })}
                          className={`flex items-center justify-center rounded-xl bg-violet-50/55 ring-1 ring-violet-100 transition ${
                            twSelected ? 'ring-2 ring-violet-300' : 'hover:bg-violet-50/80'
                          }`}
                        >
                          <AnimatedYoyValue
                            value={row.twValue}
                            delayMs={index * 110 + 60}
                            toneClassName={row.twValue === null ? 'text-gray-400' : row.twValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}
                          />
                        </button>
                      </>
                    )}
                  </div>
                    );
                  })()
                ))}
              </div>
            ))}
          </div>

          {trendRows.length > 0 ? (
            <div className="relative mt-4 rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 to-white px-3 py-3">
              <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12px] font-semibold text-gray-800">{trendTitle}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200">
                      {yoyBasis === 'sameStore' ? '동매장 기준' : '전체 기준'}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] leading-snug text-gray-400">
                    <p>{trendDescription.ko}</p>
                    <p>{trendDescription.en}</p>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <div className="inline-flex flex-nowrap overflow-hidden rounded-lg border border-gray-200 bg-white text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setTrendWindow('all')}
                      className={`whitespace-nowrap px-2.5 py-1 transition-colors ${
                        trendWindow === 'all' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      YTD
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('mtd')}
                      className={`whitespace-nowrap border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === 'mtd' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      MTD
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('120d')}
                      className={`whitespace-nowrap border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === '120d' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      120Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('30d')}
                      className={`whitespace-nowrap border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === '30d' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      30Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('7d')}
                      className={`whitespace-nowrap border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === '7d' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      7Days
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-medium">
                    <span className={`inline-flex items-center gap-1 ${HKMC_ACCENT.softText}`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HKMC_ACCENT.stroke }} />
                      HKMC
                    </span>
                    <span className={`inline-flex items-center gap-1 ${TW_ACCENT.softText}`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TW_ACCENT.stroke }} />
                      TW
                    </span>
                  </div>
                </div>
              </div>
              <div className="relative w-full">
                <div className="h-56 w-full sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={visibleTrendRows}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    onMouseMove={(state: any) => {
                      const point =
                        state?.activePayload?.[0]?.payload ||
                        (typeof state?.activeLabel === 'string'
                          ? visibleTrendRows.find((row) => row.label === state.activeLabel)
                          : null) ||
                        (typeof state?.activeTooltipIndex === 'number' &&
                        state.activeTooltipIndex >= 0 &&
                        state.activeTooltipIndex < visibleTrendRows.length
                          ? visibleTrendRows[state.activeTooltipIndex]
                          : null);
                      if (!point) return;
                      setActiveTrendPoint({
                        label: point.label,
                        hkmcYoy: point.hkmcYoy ?? null,
                        twYoy: point.twYoy ?? null,
                      });
                      if (
                        typeof state?.activeCoordinate?.x === 'number' &&
                        typeof state?.activeCoordinate?.y === 'number'
                      ) {
                        setActiveTrendPosition({
                          x: state.activeCoordinate.x,
                          y: state.activeCoordinate.y,
                          placement: state.activeCoordinate.y > 92 ? 'above' : 'below',
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      setActiveTrendPoint(null);
                      setActiveTrendPosition(null);
                    }}
                  >
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={trendDomain as [number, number]}
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      tickFormatter={(value) => `${Math.round(value)}%`}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <Tooltip content={() => null} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
                    <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="hkmcYoy"
                      stroke={HKMC_ACCENT.stroke}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="twYoy"
                      stroke={TW_ACCENT.stroke}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                </div>
                {activeTrendPoint && activeTrendPosition ? (
                  <div
                    className={`pointer-events-none absolute z-10 -translate-x-1/2 ${
                      activeTrendPosition?.placement === 'below' ? 'translate-y-0' : '-translate-y-full'
                    }`}
                    style={{
                      left: `clamp(76px, ${activeTrendPosition.x}px, calc(100% - 76px))`,
                      top:
                        activeTrendPosition.placement === 'below'
                          ? `${Math.min(170, activeTrendPosition.y + 22)}px`
                          : `${Math.max(28, activeTrendPosition.y - 18)}px`,
                    }}
                  >
                    <div className="inline-flex min-w-[132px] flex-col rounded-2xl border border-white/60 bg-white/68 px-3 py-2 text-[12px] shadow-lg backdrop-blur-[3px]">
                      <p className="font-semibold text-gray-800">Date {activeTrendPoint.label}</p>
                      <p className={`mt-1 ${HKMC_ACCENT.softText}`}>hkmcYoy : {formatTrendTooltipValue(activeTrendPoint.hkmcYoy)}</p>
                      <p className={`mt-0.5 ${TW_ACCENT.softText}`}>twYoy : {formatTrendTooltipValue(activeTrendPoint.twYoy)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3">
          <button
            type="button"
            onClick={handleCloseForToday}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Hide for Today
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
