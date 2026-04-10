'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type RegionSalesSnapshot = {
  daily_yoy: number | null;
  recent_7d_yoy: number | null;
  yoy: number | null;
  projected_mtd_yoy: number | null;
  yoy_ytd: number | null;
  daily_yoy_trend: Array<{
    date: string;
    label: string;
    yoy: number | null;
    sales_act: number;
    sales_act_ly: number;
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

function formatMonthDay(date: Date) {
  return `${MONTH_EN[date.getMonth()]} ${date.getDate()}`;
}

function readRegionSnapshot(section1Data: any): RegionSalesSnapshot | null {
  const total = section1Data?.total_subtotal;
  if (!total) return null;

  return {
    daily_yoy:
      typeof total.daily_yoy === 'number' && Number.isFinite(total.daily_yoy) ? total.daily_yoy : null,
    recent_7d_yoy:
      typeof total.recent_7d_yoy === 'number' && Number.isFinite(total.recent_7d_yoy)
        ? total.recent_7d_yoy
        : null,
    yoy: typeof total.yoy === 'number' && Number.isFinite(total.yoy) ? total.yoy : null,
    projected_mtd_yoy:
      typeof total.projectedYoY === 'number' && Number.isFinite(total.projectedYoY)
        ? total.projectedYoY
        : null,
    yoy_ytd:
      typeof total.yoy_ytd === 'number' && Number.isFinite(total.yoy_ytd) ? total.yoy_ytd : null,
    daily_yoy_trend: Array.isArray(total.daily_yoy_trend) ? total.daily_yoy_trend : [],
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
    return '최근 120일 시작일부터 각 날짜까지 누적 YoY, 100% 기준선 / Cumulative YoY from the last 120-day start with 100% baseline';
  }
  if (window === '7d') {
    return '최근 7일 시작일부터 각 날짜까지 누적 YoY, 100% 기준선 / Cumulative YoY from the last 7-day start with 100% baseline';
  }
  if (window === '30d') {
    return '최근 30일 시작일부터 각 날짜까지 누적 YoY, 100% 기준선 / Cumulative YoY from the last 30-day start with 100% baseline';
  }
  return '1/1부터 각 날짜까지 누적 YoY 추이, 100% 기준선 / Cumulative YoY from Jan 1 with 100% baseline';
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
  const [trendWindow, setTrendWindow] = useState<'all' | '120d' | '30d' | '7d'>('all');
  const lastDateRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const hkmcSnapshot = useMemo(() => readRegionSnapshot(hkmcSection1Data), [hkmcSection1Data]);
  const twSnapshot = useMemo(() => readRegionSnapshot(twSection1Data), [twSection1Data]);
  const labels = useMemo(() => buildLabels(date), [date]);
  const isReady = !!hkmcSnapshot && !!twSnapshot;

  const rows = useMemo<MetricRow[]>(
    () => [
      {
        key: 'daily',
        metric: labels.rows[0].metric,
        period: labels.rows[0].period,
        hkmcValue: hkmcSnapshot?.daily_yoy ?? null,
        twValue: twSnapshot?.daily_yoy ?? null,
      },
      {
        key: 'recent7d',
        metric: labels.rows[1].metric,
        period: labels.rows[1].period,
        hkmcValue: hkmcSnapshot?.recent_7d_yoy ?? null,
        twValue: twSnapshot?.recent_7d_yoy ?? null,
      },
      {
        key: 'mtd',
        metric: labels.rows[2].metric,
        period: labels.rows[2].period,
        hkmcValue: hkmcSnapshot?.yoy ?? null,
        twValue: twSnapshot?.yoy ?? null,
      },
      {
        key: 'projectedMtd',
        metric: labels.rows[3].metric,
        period: labels.rows[3].period,
        hkmcValue: hkmcSnapshot?.projected_mtd_yoy ?? null,
        twValue: twSnapshot?.projected_mtd_yoy ?? null,
        isProjected: true,
      },
      {
        key: 'ytd',
        metric: labels.rows[4].metric,
        period: labels.rows[4].period,
        hkmcValue: hkmcSnapshot?.yoy_ytd ?? null,
        twValue: twSnapshot?.yoy_ytd ?? null,
      },
    ],
    [hkmcSnapshot, twSnapshot, labels.rows]
  );

  const trendRows = useMemo(
    () =>
      (hkmcSnapshot?.daily_yoy_trend || []).map((item, index) => ({
        label: item.label,
        hkmcYoy: item.yoy,
        hkmcCumSales: item.sales_act,
        hkmcCumSalesLy: item.sales_act_ly,
        twYoy: twSnapshot?.daily_yoy_trend?.[index]?.yoy ?? null,
        twCumSales: twSnapshot?.daily_yoy_trend?.[index]?.sales_act ?? 0,
        twCumSalesLy: twSnapshot?.daily_yoy_trend?.[index]?.sales_act_ly ?? 0,
      })),
    [hkmcSnapshot, twSnapshot]
  );
  const visibleTrendRows = useMemo(() => {
    if (trendWindow === 'all') return trendRows;

    const windowSize = trendWindow === '7d' ? 7 : trendWindow === '30d' ? 30 : 120;
    const slicedRows = trendRows.slice(-windowSize);
    const startIndex = Math.max(0, trendRows.length - windowSize);
    const previousRow = startIndex > 0 ? trendRows[startIndex - 1] : null;
    const hkmcBaseSales = previousRow?.hkmcCumSales ?? 0;
    const hkmcBaseSalesLy = previousRow?.hkmcCumSalesLy ?? 0;
    const twBaseSales = previousRow?.twCumSales ?? 0;
    const twBaseSalesLy = previousRow?.twCumSalesLy ?? 0;

    return slicedRows.map((row) => {
      const hkmcWindowSales = row.hkmcCumSales - hkmcBaseSales;
      const hkmcWindowSalesLy = row.hkmcCumSalesLy - hkmcBaseSalesLy;
      const twWindowSales = row.twCumSales - twBaseSales;
      const twWindowSalesLy = row.twCumSalesLy - twBaseSalesLy;

      return {
        ...row,
        hkmcYoy: hkmcWindowSalesLy > 0 ? (hkmcWindowSales / hkmcWindowSalesLy) * 100 : null,
        twYoy: twWindowSalesLy > 0 ? (twWindowSales / twWindowSalesLy) * 100 : null,
      };
    });
  }, [trendRows, trendWindow]);
  const trendDomain = useMemo(() => getTrendDomain(visibleTrendRows), [visibleTrendRows]);

  useEffect(() => {
    const previousDate = lastDateRef.current;
    lastDateRef.current = date;

    if (previousDate !== null && previousDate !== date) {
      setOpen(true);
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/50 px-4">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
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

        <div className="px-5 pb-4">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2.5 text-left text-[11px] font-semibold text-gray-400">Metric</th>
                <th className="w-[76px] pb-2.5">
                  <div className="ml-auto w-fit rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-700 ring-1 ring-gray-300/70">HKMC</div>
                </th>
                <th className="w-[76px] pb-2.5">
                  <div className="ml-auto w-fit rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200/60">TW</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key} className={i < rows.length - 1 ? 'border-b border-gray-50' : ''}>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="text-[13px] font-semibold leading-tight text-gray-800">{row.metric}</div>
                      {row.isProjected ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-200/70">
                          Forecast
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] leading-snug text-gray-400">{row.period}</div>
                  </td>
                  <td className={`py-2.5 text-right text-xl font-bold tabular-nums ${row.hkmcValue === null ? 'text-gray-400' : row.hkmcValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatYoy(row.hkmcValue)}
                  </td>
                  <td className={`py-2.5 text-right text-xl font-bold tabular-nums ${row.twValue === null ? 'text-gray-400' : row.twValue >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatYoy(row.twValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {trendRows.length > 0 ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 to-white px-3 py-3">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-gray-800">
                    {brand === 'M' ? 'YTD YoY Trend' : 'YTD YoY Trend'}
                  </p>
                  <p className="text-[11px] leading-snug text-gray-400">
                    {getTrendDescription(trendWindow)}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-[11px] font-medium">
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
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={visibleTrendRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={16}
                    />
                    <YAxis
                      domain={trendDomain as [number, number]}
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      tickFormatter={(value) => `${Math.round(value)}%`}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: any) => formatTrendTooltipValue(typeof value === 'number' ? value : null)}
                      labelFormatter={(label) => `Date ${label}`}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)',
                        fontSize: '12px',
                      }}
                    />
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
