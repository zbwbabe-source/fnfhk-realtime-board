'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface EntrySalesYoyPopupProps {
  brand: string;
  date: string;
  hkmcSection1Data: any;
  twSection1Data: any;
  hkmcSection2Data: any;
  twSection2Data: any;
  hkmcSection3Data: any;
  twSection3Data: any;
}

const STORAGE_KEY = 'dashboard-entry-sales-yoy-popup-hidden-on';
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseLocalDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getVisibilityKey(date: string) {
  return date || 'unknown-date';
}

function fmtMonthDay(date: Date) {
  return `${MONTH_EN[date.getMonth()]} ${date.getDate()}`;
}

function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return `${v.toFixed(digits)}%`;
}

function fmtPp(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}pp`;
}

// ─── Data extraction ───

function getSalesYoy(s1: any) {
  const t = s1?.total_subtotal;
  return {
    recent7d: typeof t?.recent_7d_yoy === 'number' ? t.recent_7d_yoy : null,
    mtd: typeof t?.yoy === 'number' ? t.yoy : null,
  };
}

function getDiscountDiff(s3: any): number | null {
  const h = s3?.header;
  const curTag = typeof h?.period_tag_sales === 'number' ? h.period_tag_sales : 0;
  const curAct = typeof h?.period_act_sales === 'number' ? h.period_act_sales : 0;
  const lyTag = typeof h?.period_tag_sales_ly === 'number' ? h.period_tag_sales_ly : 0;
  const lyAct = typeof h?.period_act_sales_ly === 'number' ? h.period_act_sales_ly : 0;
  if (curTag <= 0 || lyTag <= 0) return null;
  return (1 - curAct / curTag) * 100 - (1 - lyAct / lyTag) * 100;
}

function getSellthrough(s2: any): number | null {
  const v = s2?.header?.overall_sellthrough;
  return typeof v === 'number' ? v : null;
}

function getOldStockYoy(s3: any): number | null {
  const v = s3?.header?.curr_stock_yoy_pct;
  return typeof v === 'number' ? v : null;
}

// ─── Signal logic ───

type Signal = 'pos' | 'neg' | 'flat';

function salesSig(v: number | null): Signal {
  if (v === null) return 'flat';
  return v >= 100 ? 'pos' : 'neg';
}

function discountSig(v: number | null): Signal {
  if (v === null) return 'flat';
  if (v <= 0) return 'pos';   // discount rate decreased = good
  if (v < 1.5) return 'flat';
  return 'neg';               // discount expanding = bad
}

function sellthroughSig(v: number | null, progress: number | null): Signal {
  if (v === null || progress === null) return 'flat';
  const gap = v - progress;
  if (gap >= 0) return 'pos';
  if (gap >= -5) return 'flat';
  return 'neg';
}

function oldStockSig(v: number | null): Signal {
  if (v === null) return 'flat';
  if (v <= 100) return 'pos';  // balance shrinking = good
  if (v <= 110) return 'flat';
  return 'neg';                // balance growing = bad
}

function sigColor(s: Signal) {
  if (s === 'pos') return 'text-emerald-600';
  if (s === 'neg') return 'text-rose-600';
  return 'text-gray-700';
}

function sigDot(s: Signal) {
  if (s === 'pos') return 'bg-emerald-500';
  if (s === 'neg') return 'bg-rose-500';
  return 'bg-gray-300';
}

function getSeasonProgressRate(asOfDate: string): number | null {
  const d = parseLocalDate(asOfDate);
  if (!d) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  let start: Date;
  let end: Date;
  if (month >= 3 && month <= 8) {
    start = new Date(year, 2, 1);
    end = new Date(year, 7, 31);
  } else if (month >= 9) {
    start = new Date(year, 8, 1);
    end = new Date(year + 1, 1, new Date(year + 1, 2, 0).getDate());
  } else {
    start = new Date(year - 1, 8, 1);
    end = new Date(year, 1, new Date(year, 2, 0).getDate());
  }
  const msDay = 86400000;
  const total = Math.floor((end.getTime() - start.getTime()) / msDay) + 1;
  const elapsed = Math.max(0, Math.min(total, Math.floor((d.getTime() - start.getTime()) / msDay) + 1));
  return total > 0 ? (elapsed / total) * 100 : null;
}

// ─── Component ───

export default function EntrySalesYoyPopup({
  brand,
  date,
  hkmcSection1Data,
  twSection1Data,
  hkmcSection2Data,
  twSection2Data,
  hkmcSection3Data,
  twSection3Data,
}: EntrySalesYoyPopupProps) {
  const [open, setOpen] = useState(false);
  const lastDateRef = useRef<string | null>(null);

  const currentDate = useMemo(() => parseLocalDate(date), [date]);
  const progress = useMemo(() => getSeasonProgressRate(date), [date]);

  const hkmcSales = useMemo(() => getSalesYoy(hkmcSection1Data), [hkmcSection1Data]);
  const twSales = useMemo(() => getSalesYoy(twSection1Data), [twSection1Data]);
  const hkmcDiscDiff = useMemo(() => getDiscountDiff(hkmcSection3Data), [hkmcSection3Data]);
  const twDiscDiff = useMemo(() => getDiscountDiff(twSection3Data), [twSection3Data]);
  const hkmcST = useMemo(() => getSellthrough(hkmcSection2Data), [hkmcSection2Data]);
  const twST = useMemo(() => getSellthrough(twSection2Data), [twSection2Data]);
  const hkmcOldYoy = useMemo(() => getOldStockYoy(hkmcSection3Data), [hkmcSection3Data]);
  const twOldYoy = useMemo(() => getOldStockYoy(twSection3Data), [twSection3Data]);

  const isReady =
    !!hkmcSection1Data?.total_subtotal &&
    !!twSection1Data?.total_subtotal &&
    !!hkmcSection2Data?.header &&
    !!twSection2Data?.header &&
    !!hkmcSection3Data?.header &&
    !!twSection3Data?.header;

  useEffect(() => {
    if (!isReady) return;
    const previousDate = lastDateRef.current;
    lastDateRef.current = date;

    if (previousDate !== null && previousDate !== date) {
      setOpen(true);
      return;
    }

    const hiddenOn = window.localStorage.getItem(STORAGE_KEY);
    setOpen(hiddenOn !== getVisibilityKey(date));
  }, [date, isReady]);

  if (!open || !isReady || !currentDate) return null;

  const handleCloseForToday = () => {
    window.localStorage.setItem(STORAGE_KEY, getVisibilityKey(date));
    setOpen(false);
  };

  type Row = {
    key: string;
    label: string;
    sub: string;
    hkmc: string;
    tw: string;
    hkmcSig: Signal;
    twSig: Signal;
    hkmcSub?: string;
    twSub?: string;
  };

  const rows: Row[] = [
    {
      key: 'sales',
      label: 'Sales YoY',
      sub: 'Last 7 days',
      hkmc: fmtPct(hkmcSales.recent7d),
      tw: fmtPct(twSales.recent7d),
      hkmcSig: salesSig(hkmcSales.recent7d),
      twSig: salesSig(twSales.recent7d),
      hkmcSub: `MTD ${fmtPct(hkmcSales.mtd)}`,
      twSub: `MTD ${fmtPct(twSales.mtd)}`,
    },
    {
      key: 'discount',
      label: 'Discount Rate',
      sub: 'YoY change',
      hkmc: fmtPp(hkmcDiscDiff),
      tw: fmtPp(twDiscDiff),
      hkmcSig: discountSig(hkmcDiscDiff),
      twSig: discountSig(twDiscDiff),
    },
    {
      key: 'sellthrough',
      label: 'In-Season Sell-through',
      sub: `vs ${progress !== null ? progress.toFixed(0) : '-'}% season elapsed`,
      hkmc: fmtPct(hkmcST, 1),
      tw: fmtPct(twST, 1),
      hkmcSig: sellthroughSig(hkmcST, progress),
      twSig: sellthroughSig(twST, progress),
    },
    {
      key: 'oldstock',
      label: 'Old-Season Balance',
      sub: 'YoY',
      hkmc: fmtPct(hkmcOldYoy),
      tw: fmtPct(twOldYoy),
      hkmcSig: oldStockSig(hkmcOldYoy),
      twSig: oldStockSig(twOldYoy),
    },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/50 px-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <p className="text-[10px] font-bold tracking-[0.15em] text-emerald-600">DAILY BRIEF</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-900">{fmtMonthDay(currentDate)}</h2>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">{brand === 'M' ? 'MLB' : brand}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-[1fr_64px_64px] items-end gap-1 px-5 pb-1.5">
          <div />
          <div className="text-center">
            <span className="inline-block rounded-full bg-blue-50 px-2 py-px text-[10px] font-bold text-blue-700 ring-1 ring-blue-200/60">HKMC</span>
          </div>
          <div className="text-center">
            <span className="inline-block rounded-full bg-violet-50 px-2 py-px text-[10px] font-bold text-violet-700 ring-1 ring-violet-200/60">TW</span>
          </div>
        </div>

        {/* Rows */}
        <div className="px-4 pb-3 space-y-0.5">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_64px_64px] items-center gap-1 rounded-lg px-1.5 py-2">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-gray-800 leading-tight">{row.label}</div>
                <div className="text-[10px] text-gray-400 leading-snug">{row.sub}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${sigDot(row.hkmcSig)}`} />
                  <span className={`text-[17px] font-bold tabular-nums leading-none ${sigColor(row.hkmcSig)}`}>{row.hkmc}</span>
                </div>
                {row.hkmcSub && <div className="text-[9px] text-gray-400 mt-0.5">{row.hkmcSub}</div>}
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${sigDot(row.twSig)}`} />
                  <span className={`text-[17px] font-bold tabular-nums leading-none ${sigColor(row.twSig)}`}>{row.tw}</span>
                </div>
                {row.twSub && <div className="text-[9px] text-gray-400 mt-0.5">{row.twSub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-2.5">
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
