'use client';

import { useState } from 'react';
import { type Language } from '@/lib/translations';

type Cell = any;

interface Props {
  section3Data: any;
  region: string;
  language: Language;
}

const colOrder = ['1년차', '2년차', '3년차 이상'] as const;

const yearLabel = (bucket: string, language: Language) => {
  if (language === 'ko') return bucket === '3년차 이상' ? '3년차' : bucket;
  if (bucket === '1년차') return 'Year 1';
  if (bucket === '2년차') return 'Year 2';
  if (bucket === '3년차 이상') return 'Year 3+';
  return bucket;
};

const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(d)}%`;

const money = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
};

const pp = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  if (v > 0) return `+${v.toFixed(1)}%p`;
  if (v < 0) return `△${Math.abs(v).toFixed(1)}%p`;
  return '0.0%p';
};

const formatMillionSigned = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (value > 0) return `+${(value / 1_000_000).toFixed(1)}M`;
  if (value < 0) return `△${(Math.abs(value) / 1_000_000).toFixed(1)}M`;
  return '0.0M';
};

const gap = (actual: number | null | undefined, target: number | null | undefined, language: Language) => {
  if (
    actual === null || actual === undefined || target === null || target === undefined ||
    !Number.isFinite(actual) || !Number.isFinite(target)
  ) return null;
  const diff = actual - target;
  const prefix = language === 'ko' ? '목표대비 ' : 'vs tgt ';
  if (diff > 0) return `${prefix}+${(diff / 1_000_000).toFixed(1)}M`;
  if (diff < 0) return `${prefix}△${(Math.abs(diff) / 1_000_000).toFixed(1)}M`;
  return `${prefix}0.0M`;
};

const sumFinite = (values: Array<number | null | undefined>) =>
  values.reduce<number>((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0);

const salesTone = (actual: number | null | undefined, target: number | null | undefined) => {
  if (
    actual === null || actual === undefined || target === null || target === undefined ||
    !Number.isFinite(actual) || !Number.isFinite(target)
  ) return 'text-gray-900';
  return actual >= target ? 'text-emerald-600' : 'text-rose-600';
};

const stockTone = (cell: Cell) => {
  if (typeof cell?.rolling_year_end_gap !== 'number') return 'text-gray-900';
  if (cell.rolling_year_end_gap > 0) return 'text-rose-600';
  if (cell.rolling_year_end_gap < 0) return 'text-emerald-600';
  return 'text-gray-900';
};

const renderMatrixValue = (cell: Cell, type: 'yearEndTarget' | 'rollingYearEnd') => {
  if (!cell || cell?.completed) return '-';
  return type === 'yearEndTarget' ? money(cell?.year_end_target_stock) : money(cell?.rolling_year_end_stock);
};

const boxTone = (cell: Cell) => {
  if (cell?.completed) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (typeof cell?.projected_progress_pct === 'number' && cell.projected_progress_pct >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (typeof cell?.progress_pct === 'number' && cell.progress_pct >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (typeof cell?.progress_pct === 'number' && cell.progress_pct >= 80) return 'bg-amber-50 text-amber-700 border-amber-100';
  if (cell?.progress_pct == null && cell?.projected_progress_pct == null) return 'bg-gray-50 text-gray-400 border-gray-200';
  return 'bg-rose-50 text-rose-700 border-rose-100';
};

export default function Section3TargetHeatmap({ section3Data, region, language }: Props) {
  const [open, setOpen] = useState(false);
  if (region !== 'HKMC') return null;
  const heatmap = section3Data?.target_heatmap;
  if (!heatmap?.rows?.length) return null;

  const rowOrder = [
    { key: 'wear', label: language === 'ko' ? '의류' : 'Wear' },
    { key: 'accessory', label: language === 'ko' ? '악세' : 'Accessory' },
    { key: 'all', label: language === 'ko' ? '전체' : 'Total' },
  ] as const;

  const cellMap = new Map<string, Cell>();
  for (const row of heatmap.rows) for (const cell of row.cells) cellMap.set(`${cell.category_key}:${row.year_bucket}`, cell);

  const getCell = (rowKey: string, bucket: string) => cellMap.get(`${rowKey}:${bucket}`);
  const getSummary = (rowKey: string) => {
    const cells = colOrder.map((bucket) => getCell(rowKey, bucket)).filter(Boolean);
    const actualWeight = sumFinite(cells.map((c) => typeof c?.actual_sold_amt === 'number' ? c.actual_sold_amt : 0));
    const targetWeight = sumFinite(cells.map((c) => typeof c?.target_sold_gross === 'number' ? c.target_sold_gross : 0));
    return {
      actual_sold_amt: sumFinite(cells.map((c) => c?.actual_sold_amt)),
      target_sold_gross: sumFinite(cells.map((c) => c?.target_sold_gross)),
      rolling_year_end_stock: sumFinite(cells.map((c) => c?.rolling_year_end_stock)),
      year_end_target_stock: sumFinite(cells.map((c) => c?.year_end_target_stock)),
      actual_discount_rate: actualWeight > 0 ? sumFinite(cells.map((c) => (c?.actual_sold_amt ?? 0) * (c?.actual_discount_rate ?? 0))) / actualWeight : null,
      target_discount_rate: targetWeight > 0 ? sumFinite(cells.map((c) => (c?.target_sold_gross ?? 0) * (c?.target_discount_rate ?? 0))) / targetWeight : null,
      discount_delta_pct: null,
      rolling_year_end_gap: sumFinite(cells.map((c) => c?.rolling_year_end_stock)) - sumFinite(cells.map((c) => c?.year_end_target_stock)),
    };
  };

  const isThirdYearBucket = (bucket: string) => bucket === '3년차 이상';

  const totalRolling = sumFinite(colOrder.map((b) => getCell('all', b)?.rolling_year_end_stock));
  const totalTarget = sumFinite(colOrder.map((b) => getCell('all', b)?.year_end_target_stock));
  const totalPct = totalTarget > 0 ? (totalRolling / totalTarget) * 100 : null;
  const totalDelta = totalRolling - totalTarget;
  const totalTone = totalPct === null ? 'bg-gray-100 text-gray-500' : totalPct > 100 ? 'bg-rose-50 text-rose-600' : totalPct < 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500';
  const asof = typeof section3Data?.asof_date === 'string' ? section3Data.asof_date : '-';
  const asofLabel = /^\d{4}-\d{2}-\d{2}$/.test(asof) ? `${Number(asof.slice(5, 7))}/${Number(asof.slice(8, 10))}` : asof;

  return (
    <article className="flex h-[540px] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{language === 'ko' ? '과시즌 목표대비 히트맵' : 'Old-season Target Heatmap'}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{language === 'ko' ? '목표대비 소진금액 기준 | 행: 의류·악세·전체 / 열: 연차' : 'Dep. vs tgt | Wear/Acc/Total by age'}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100">
          {language === 'ko' ? '상세보기' : 'Show details'}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-[76px_repeat(3,minmax(0,1fr))] gap-2">
          <div />
          {colOrder.map((bucket) => <div key={bucket} className="rounded-lg bg-amber-50 px-2 py-2 text-center text-xs font-semibold text-amber-900">{yearLabel(bucket, language)}</div>)}
          {rowOrder.map((rowMeta) => (
            <div key={rowMeta.key} className="contents">
              <div className="flex items-center justify-center rounded-lg bg-gray-50 px-2 text-xs font-semibold text-gray-700">{rowMeta.label}</div>
              {colOrder.map((bucket) => {
                const cell = getCell(rowMeta.key, bucket);
                return (
                  <div key={`${rowMeta.key}-${bucket}`} className={`rounded-xl border p-3 text-center ${boxTone(cell)}`}>
                    <p className="text-lg font-bold leading-tight">{cell?.completed ? (language === 'ko' ? '완료' : 'Done') : pct(cell?.progress_pct, 0)}</p>
                    <p className="mt-1 whitespace-nowrap text-[11px] font-medium">{cell?.completed ? (language === 'ko' ? '소진완료' : 'Cleared') : `${language === 'ko' ? '월말' : 'M-end'} ${pct(cell?.projected_progress_pct, 0)}`}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-auto rounded-2xl border border-gray-100 bg-gray-50/55 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold tracking-[0.04em] text-gray-500">{language === 'ko' ? '목표대비 연말재고(TAG)' : 'YE Stock vs Tgt (TAG)'}</p>
              {totalPct !== null ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${totalTone}`}>{totalPct.toFixed(0)}%</span> : null}
              {totalPct !== null ? <span className={`text-[10px] font-medium ${totalPct > 100 ? 'text-rose-600' : totalPct < 100 ? 'text-emerald-600' : 'text-gray-500'}`}>{language === 'ko' ? `${totalPct > 100 ? '목표대비 재고증가' : totalPct < 100 ? '목표대비 재고감소' : '목표대비 동일'} ${formatMillionSigned(totalDelta)}` : `${totalPct > 100 ? 'Higher stk' : totalPct < 100 ? 'Lower stk' : 'On tgt'} ${formatMillionSigned(totalDelta)}`}</span> : null}
            </div>
            <p className="text-[9px] text-gray-400">{language === 'ko' ? '롤링 / 목표' : 'Roll / Tgt'}</p>
          </div>
          <div className="grid grid-cols-[64px_repeat(3,minmax(0,1fr))] gap-1.5">
            <div />
            {colOrder.map((bucket) => <div key={`detail-${bucket}`} className="rounded-md bg-white px-1.5 py-1 text-center text-[10px] font-semibold text-gray-700 shadow-sm">{yearLabel(bucket, language)}</div>)}
            {rowOrder.map((rowMeta) => (
              <div key={`detail-${rowMeta.key}`} className="contents">
                <div className="flex items-center justify-center rounded-md bg-white px-1.5 text-[10px] font-semibold text-gray-700 shadow-sm">{rowMeta.label}</div>
                {colOrder.map((bucket) => {
                  const cell = getCell(rowMeta.key, bucket);
                  return <div key={`detail-${rowMeta.key}-${bucket}`} className="rounded-md border border-gray-200 bg-white px-1.5 py-1.5 shadow-sm"><p className={`text-[10px] font-semibold leading-tight ${stockTone(cell)}`}>{renderMatrixValue(cell, 'rollingYearEnd')} / {renderMatrixValue(cell, 'yearEndTarget')}</p></div>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{language === 'ko' ? '과시즌 목표 상세 매트릭스' : 'Old-season Target Detail Matrix'}</h2>
                <p className="mt-1 text-xs text-gray-500">{language === 'ko' ? '항목별 소진/연말재고의 실적과 목표를 함께 비교합니다.' : 'Compare sales and year-end stock actuals against targets by item.'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50">{language === 'ko' ? '닫기' : 'Close'}</button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{language === 'ko' ? '소진: 실적 / 목표' : 'Sales: Actual / Target'}</span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">{language === 'ko' ? '연말재고: 롤링 / 목표' : 'YE Stock: Rolling / Target'}</span>
                <span>{language === 'ko' ? '정보 아이콘에 마우스를 올리면 상세를 볼 수 있습니다.' : 'Hover the info icon for details.'}</span>
              </div>

              <div className="grid grid-cols-[88px_repeat(4,minmax(0,1fr))] gap-2">
                <div />
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-semibold text-gray-700 shadow-sm">{language === 'ko' ? '합계' : 'Total'}</div>
                {colOrder.map((bucket) => <div key={`modal-${bucket}`} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-semibold text-gray-700 shadow-sm">{yearLabel(bucket, language)}</div>)}

                {rowOrder.map((rowMeta) => (
                  <div key={`modal-${rowMeta.key}`} className="contents">
                    <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-sm font-semibold text-gray-700">{rowMeta.label}</div>
                    {[getSummary(rowMeta.key), ...colOrder.map((bucket) => getCell(rowMeta.key, bucket))].map((cell, index) => {
                      const salesClass = salesTone(cell?.actual_sold_amt, cell?.target_sold_gross);
                      const stockClass = stockTone(cell);
                      const salesGap = gap(cell?.actual_sold_amt, cell?.target_sold_gross, language);
                      const stockGap = gap(cell?.rolling_year_end_stock, cell?.year_end_target_stock, language);
                      const bucket = index === 0 ? 'summary' : colOrder[index - 1];

                      return (
                        <div key={`modal-${rowMeta.key}-${bucket}`} className={`relative rounded-xl border p-3 shadow-sm ${bucket !== 'summary' && isThirdYearBucket(bucket) ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`}>
                          <div className="space-y-2">
                            <div>
                              <div className="flex items-center gap-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-emerald-600">{language === 'ko' ? '소진' : 'Sales'}</p>
                                <div className="group/info relative">
                                  <button type="button" className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] font-semibold text-gray-400" aria-label={language === 'ko' ? '상세 정보' : 'Detail info'}>i</button>
                                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left text-[11px] leading-relaxed text-gray-600 shadow-lg group-hover/info:block">
                                    <p>{language === 'ko' ? '소진 실적' : 'Sales actual'}: <span className={`font-semibold ${salesClass}`}>{money(cell?.actual_sold_amt)}</span></p>
                                    <p>{language === 'ko' ? '소진 목표' : 'Sales target'}: <span className="font-semibold text-gray-900">{money(cell?.target_sold_gross)}</span></p>
                                    <p>{language === 'ko' ? '연말재고 롤링' : 'YE stock rolling'}: <span className={`font-semibold ${stockClass}`}>{money(cell?.rolling_year_end_stock)}</span></p>
                                    <p>{language === 'ko' ? '연말재고 목표' : 'YE stock target'}: <span className="font-semibold text-gray-900">{money(cell?.year_end_target_stock)}</span></p>
                                    <p>{language === 'ko' ? '할인율 실적' : 'Discount actual'}: <span className="font-semibold italic text-sky-700">{pct(cell?.actual_discount_rate != null ? cell.actual_discount_rate * 100 : null, 1)}</span></p>
                                    <p>{language === 'ko' ? '할인율 목표' : 'Discount target'}: <span className="font-semibold italic text-sky-700">{pct(cell?.target_discount_rate != null ? cell.target_discount_rate * 100 : null, 1)}</span></p>
                                    <p>{language === 'ko' ? '할인율 차이' : 'Discount delta'}: <span className={`font-semibold ${typeof cell?.discount_delta_pct === 'number' ? cell.discount_delta_pct > 0 ? 'text-rose-600' : cell.discount_delta_pct < 0 ? 'text-emerald-600' : 'text-gray-600' : 'text-gray-600'}`}>{pp(cell?.discount_delta_pct)}</span></p>
                                    <p>{language === 'ko' ? `연말재고 롤링은 1/1~${asofLabel} 실적 반영 기준 연말 예상값입니다.` : `YE stock rolling is a year-end estimate using actuals through ${asofLabel}.`}</p>
                                  </div>
                                </div>
                              </div>
                              <p className={`mt-0.5 text-sm font-semibold ${salesClass}`}>{money(cell?.actual_sold_amt)} / {money(cell?.target_sold_gross)}</p>
                              <p className="mt-0.5 text-[11px] leading-tight text-gray-600">
                                {language === 'ko' ? '할인율 ' : 'Disc. '}
                                <span className="font-semibold italic text-sky-700">{pct(cell?.actual_discount_rate != null ? cell.actual_discount_rate * 100 : null, 1)}</span>
                                {' / '}
                                <span className="font-semibold italic text-sky-700">{pct(cell?.target_discount_rate != null ? cell.target_discount_rate * 100 : null, 1)}</span>
                              </p>
                              {salesGap ? <p className={`mt-0.5 text-[11px] font-semibold ${salesClass}`}>({salesGap})</p> : null}
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-sky-600">{language === 'ko' ? '연말재고' : 'YE Stock'}</p>
                              <p className={`mt-0.5 text-sm font-semibold ${stockClass}`}>{money(cell?.rolling_year_end_stock)} / {money(cell?.year_end_target_stock)}</p>
                              {stockGap ? <p className={`mt-0.5 text-[11px] font-semibold ${stockClass}`}>({stockGap})</p> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
