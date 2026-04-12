'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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

interface EntrySalesYoyPopupProps {
  brand: string;
  date: string;
  hkmcSection1Data: any;
  twSection1Data: any;
  hkmcSection2Data?: any;
  twSection2Data?: any;
  hkmcSection3Data?: any;
  twSection3Data?: any;
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

function getTrendDescription(window: 'all' | '120d' | '30d' | '7d') {
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

function getTrendTitle(window: 'all' | '120d' | '30d' | '7d') {
  if (window === '120d') return '120 Days YoY Trend';
  if (window === '30d') return '30 Days YoY Trend';
  if (window === '7d') return '7 Days YoY Trend';
  return 'YTD YoY Trend';
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
  hkmcSection1Data,
  twSection1Data,
}: EntrySalesYoyPopupProps) {
  const [open, setOpen] = useState(false);
  const [yoyBasis, setYoyBasis] = useState<'sameStore' | 'overall'>('overall');
  const [trendWindow, setTrendWindow] = useState<'all' | '120d' | '30d' | '7d'>('all');
  const [sameStoreTrendRows, setSameStoreTrendRows] = useState<
    Array<{ label: string; hkmcYoy: number | null; twYoy: number | null }>
  >([]);
  const [activeTrendPoint, setActiveTrendPoint] = useState<{
    label: string;
    hkmcYoy: number | null;
    twYoy: number | null;
  } | null>(null);
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
        hkmcValue: yoyBasis === 'sameStore' ? hkmcSnapshot?.same_store_yoy_ytd ?? null : hkmcSnapshot?.yoy_ytd ?? null,
        twValue: yoyBasis === 'sameStore' ? twSnapshot?.same_store_yoy_ytd ?? null : twSnapshot?.yoy_ytd ?? null,
      },
    ],
    [hkmcSnapshot, twSnapshot, labels.rows, yoyBasis]
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
      return;
    }

    let cancelled = false;

    const fetchRegionTrend = async (region: 'HKMC' | 'TW') => {
      const query = new URLSearchParams({
        region,
        brand,
        date,
        window: trendWindow,
      });
      const response = await fetch(`/api/section1/same-store-yoy-trend?${query.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load ${region} same-store trend`);
      return response.json();
    };

    const load = async () => {
      try {
        const [hkmcResult, twResult] = await Promise.all([fetchRegionTrend('HKMC'), fetchRegionTrend('TW')]);
        if (cancelled) return;

        const twMap = new Map(
          Array.isArray(twResult?.rows) ? twResult.rows.map((row: any) => [String(row.label || ''), row]) : []
        );
        const mergedRows = Array.isArray(hkmcResult?.rows)
          ? hkmcResult.rows.map((row: any) => {
              const twRow: any = twMap.get(String(row.label || ''));
              return {
                label: String(row.label || ''),
                hkmcYoy: typeof row?.yoy === 'number' ? row.yoy : null,
                twYoy: typeof twRow?.yoy === 'number' ? twRow.yoy : null,
              };
            })
          : [];
        setSameStoreTrendRows(mergedRows);
      } catch {
        if (!cancelled) {
          setSameStoreTrendRows([]);
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
      return trendRows.map((row) => ({
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

  useEffect(() => {
    setActiveTrendPoint(null);
    setActiveTrendPosition(null);
  }, [visibleTrendRows]);

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

  if (!open || !isReady) return null;

  const handleCloseForToday = () => {
    window.localStorage.setItem(STORAGE_KEY, getVisibilityKey(date));
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/50 px-3 sm:px-4">
      <div className="relative w-full max-w-[680px] overflow-hidden rounded-2xl bg-white shadow-2xl">
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
          <div className="mb-2 flex items-center justify-end">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setYoyBasis('overall')}
                className={`px-3 py-1 transition-colors ${
                  yoyBasis === 'overall' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Overall
              </button>
              <button
                type="button"
                onClick={() => setYoyBasis('sameStore')}
                className={`border-l border-gray-200 px-3 py-1 transition-colors ${
                  yoyBasis === 'sameStore' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Same Store
              </button>
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
                  <div
                    key={row.key}
                    className={`grid grid-cols-[minmax(0,1fr)_92px_92px] items-stretch gap-x-3 py-2 ${
                      index < group.rows.length - 1 ? 'border-b border-white/80' : ''
                    }`}
                  >
                    <div className="pr-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="text-[13px] font-semibold leading-tight text-gray-800">{row.metric}</div>
                        {row.isProjected ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-200/70">
                            Forecast
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] leading-snug text-gray-400">{row.period}</div>
                    </div>
                    <div className="flex items-center justify-center rounded-xl bg-white/85 ring-1 ring-slate-200/80">
                      <div className={`whitespace-nowrap text-center text-lg font-bold tabular-nums sm:text-xl ${row.hkmcValue === null ? 'text-gray-400' : row.hkmcValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatYoy(row.hkmcValue)}
                      </div>
                    </div>
                    <div className="flex items-center justify-center rounded-xl bg-violet-50/55 ring-1 ring-violet-100">
                      <div className={`whitespace-nowrap text-center text-lg font-bold tabular-nums sm:text-xl ${row.twValue === null ? 'text-gray-400' : row.twValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatYoy(row.twValue)}
                      </div>
                    </div>
                  </div>
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
                  <div className="flex flex-wrap overflow-hidden rounded-lg border border-gray-200 bg-white text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setTrendWindow('all')}
                      className={`px-2.5 py-1 transition-colors ${
                        trendWindow === 'all' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      YTD
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('120d')}
                      className={`border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === '120d' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      120Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('30d')}
                      className={`border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === '30d' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      30Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendWindow('7d')}
                      className={`border-l border-gray-200 px-2.5 py-1 transition-colors ${
                        trendWindow === '7d' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
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
