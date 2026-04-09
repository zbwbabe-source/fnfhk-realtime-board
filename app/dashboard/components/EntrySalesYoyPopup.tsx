'use client';

import { useEffect, useMemo, useState } from 'react';

type RegionSalesSnapshot = {
  daily_yoy: number | null;
  recent_7d_yoy: number | null;
  yoy: number | null;
  yoy_ytd: number | null;
};

type MetricRow = {
  key: string;
  metric: string;
  period: string;
  hkmcValue: number | null;
  twValue: number | null;
};

interface EntrySalesYoyPopupProps {
  brand: string;
  date: string;
  hkmcSection1Data: any;
  twSection1Data: any;
}

const STORAGE_KEY = 'dashboard-entry-sales-yoy-popup-hidden-on';
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
    yoy_ytd:
      typeof total.yoy_ytd === 'number' && Number.isFinite(total.yoy_ytd) ? total.yoy_ytd : null,
  };
}

function formatYoy(value: number | null) {
  return value === null ? '-' : `${Math.round(value)}%`;
}

function toneClass(value: number | null) {
  if (value === null) return 'text-gray-400';
  return value >= 100 ? 'text-emerald-600' : 'text-rose-600';
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
  const [visibilityChecked, setVisibilityChecked] = useState(false);

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
        key: 'ytd',
        metric: labels.rows[3].metric,
        period: labels.rows[3].period,
        hkmcValue: hkmcSnapshot?.yoy_ytd ?? null,
        twValue: twSnapshot?.yoy_ytd ?? null,
      },
    ],
    [hkmcSnapshot, twSnapshot, labels.rows]
  );

  useEffect(() => {
    if (!isReady) return;

    const visibilityKey = getVisibilityKey(date);
    const hiddenOn = window.localStorage.getItem(STORAGE_KEY);
    setOpen(hiddenOn !== visibilityKey);
    setVisibilityChecked(true);
  }, [date, isReady]);

  if (!open || !isReady) return null;

  const handleCloseForToday = () => {
    window.localStorage.setItem(STORAGE_KEY, getVisibilityKey(date));
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/50 px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
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

        {/* Table */}
        <div className="px-5 pb-4">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2.5 text-left text-[11px] font-semibold text-gray-400">Metric</th>
                <th className="pb-2.5 w-[76px]">
                  <div className="ml-auto w-fit rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200/60">HKMC</div>
                </th>
                <th className="pb-2.5 w-[76px]">
                  <div className="ml-auto w-fit rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200/60">TW</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key} className={i < rows.length - 1 ? 'border-b border-gray-50' : ''}>
                  <td className="py-2.5 pr-3">
                    <div className="text-[13px] font-semibold text-gray-800 leading-tight">{row.metric}</div>
                    <div className="text-[11px] text-gray-400 leading-snug">{row.period}</div>
                  </td>
                  <td className={`py-2.5 text-right text-xl font-bold tabular-nums ${toneClass(row.hkmcValue)}`}>
                    {formatYoy(row.hkmcValue)}
                  </td>
                  <td className={`py-2.5 text-right text-xl font-bold tabular-nums ${toneClass(row.twValue)}`}>
                    {formatYoy(row.twValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
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
