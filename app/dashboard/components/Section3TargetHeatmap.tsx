'use client';

import { useState } from 'react';
import { type Language } from '@/lib/translations';

interface Section3TargetHeatmapProps {
  section3Data: any;
  region: string;
  language: Language;
}

const yearBucketLabel = (bucket: string, language: Language) => {
  if (language === 'ko') {
    return bucket === '3년차 이상' ? '3년차' : bucket;
  }
  if (bucket === '1년차') return 'Year 1';
  if (bucket === '2년차') return 'Year 2';
  if (bucket === '3년차 이상') return 'Year 3+';
  return bucket;
};

const toneClass = (
  value: number | null | undefined,
  projectedValue: number | null | undefined,
  completed: boolean
) => {
  if (completed) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (
    (value === null || value === undefined || !Number.isFinite(value)) &&
    (projectedValue === null || projectedValue === undefined || !Number.isFinite(projectedValue))
  ) {
    return 'bg-gray-50 text-gray-400 border-gray-200';
  }
  if (
    projectedValue !== null &&
    projectedValue !== undefined &&
    Number.isFinite(projectedValue) &&
    projectedValue >= 100
  ) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }
  if (value !== null && value !== undefined && Number.isFinite(value) && value >= 100) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }
  if (value !== null && value !== undefined && Number.isFinite(value) && value >= 80) {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }
  return 'bg-rose-50 text-rose-700 border-rose-100';
};

const formatPercent = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? '-' : `${value.toFixed(digits)}%`;

const formatSignedPp = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%p`;
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
};

const formatMillionSigned = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${(Math.abs(value) / 1000000).toFixed(1)}M`;
};

export default function Section3TargetHeatmap({
  section3Data,
  region,
  language,
}: Section3TargetHeatmapProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);

  if (region !== 'HKMC') return null;

  const heatmap = section3Data?.target_heatmap;
  if (!heatmap?.rows?.length) {
    return (
      <article className="flex h-[540px] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-base font-semibold text-gray-900">
          {language === 'ko' ? '과시즌 목표대비 히트맵' : 'Old-season Target Heatmap'}
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          {language === 'ko' ? '목표 데이터 준비 중' : 'Target data unavailable'}
        </p>
      </article>
    );
  }

  const rowOrder = [
    { key: 'wear', label: language === 'ko' ? '의류' : 'Wear' },
    { key: 'accessory', label: language === 'ko' ? '악세' : 'Accessory' },
    { key: 'all', label: language === 'ko' ? '전체' : 'Total' },
  ] as const;
  const colOrder = ['1년차', '2년차', '3년차 이상'] as const;
  const cellMap = new Map<string, any>();

  for (const row of heatmap.rows) {
    for (const cell of row.cells) {
      cellMap.set(`${cell.category_key}:${row.year_bucket}`, cell);
    }
  }

  const rollingVsTargetPct = (() => {
    let rollingTotal = 0;
    let targetTotal = 0;

    for (const bucket of colOrder) {
      const totalCell = cellMap.get(`all:${bucket}`);
      const rolling = totalCell?.rolling_year_end_stock;
      const target = totalCell?.year_end_target_stock;

      if (typeof rolling === 'number' && Number.isFinite(rolling)) {
        rollingTotal += rolling;
      }
      if (typeof target === 'number' && Number.isFinite(target)) {
        targetTotal += target;
      }
    }

    if (targetTotal <= 0) return null;
    return (rollingTotal / targetTotal) * 100;
  })();

  const rollingVsTargetDelta = (() => {
    let rollingTotal = 0;
    let targetTotal = 0;

    for (const bucket of colOrder) {
      const totalCell = cellMap.get(`all:${bucket}`);
      const rolling = totalCell?.rolling_year_end_stock;
      const target = totalCell?.year_end_target_stock;

      if (typeof rolling === 'number' && Number.isFinite(rolling)) {
        rollingTotal += rolling;
      }
      if (typeof target === 'number' && Number.isFinite(target)) {
        targetTotal += target;
      }
    }

    if (!Number.isFinite(rollingTotal) || !Number.isFinite(targetTotal)) return null;
    return rollingTotal - targetTotal;
  })();

  const rollingVsTargetTone =
    rollingVsTargetPct === null
      ? 'bg-gray-100 text-gray-500'
      : rollingVsTargetPct > 100
        ? 'bg-rose-50 text-rose-600'
        : rollingVsTargetPct < 100
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-gray-100 text-gray-500';

  const rollingVsTargetLabel =
    rollingVsTargetPct === null
      ? null
      : language === 'ko'
        ? rollingVsTargetPct > 100
          ? `목표대비 재고증가 ${formatMillionSigned(rollingVsTargetDelta)}`
          : rollingVsTargetPct < 100
            ? `목표대비 재고감소 ${formatMillionSigned(rollingVsTargetDelta)}`
            : '목표대비 동일'
        : rollingVsTargetPct > 100
          ? `Higher stk ${formatMillionSigned(rollingVsTargetDelta)}`
          : rollingVsTargetPct < 100
            ? `Lower stk ${formatMillionSigned(rollingVsTargetDelta)}`
            : 'On tgt';

  const asofDateLabel = (() => {
    const raw = section3Data?.asof_date;
    if (typeof raw !== 'string') return '-';
    const parts = raw.split('-');
    if (parts.length !== 3) return raw;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  })();

  const thirdYearTooltip = (() => {
    const seasonType = section3Data?.season_type;
    const raw = section3Data?.asof_date;
    if (typeof raw !== 'string') {
      return language === 'ko'
        ? '3년차는 소진완료 후 100% 평가감이 될 예정입니다.'
        : 'Year 3 is expected to be evaluated at 100% once clearance is completed.';
    }

    const [yearText, monthText] = raw.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return language === 'ko'
        ? '3년차는 소진완료 후 100% 평가감이 될 예정입니다.'
        : 'Year 3 is expected to be evaluated at 100% once clearance is completed.';
    }

    const cutoff = seasonType === 'SS' ? `${year}-09-30` : `${month >= 9 ? year + 1 : year}-03-31`;

    return language === 'ko'
      ? `현재 ${seasonType}는 ${cutoff}까지 소진 기준이며, 3년차는 소진완료 후 100% 평가감이 될 예정입니다.`
      : `For ${seasonType}, depletion is tracked through ${cutoff}, and Year 3 is expected to be evaluated at 100% once clearance is completed.`;
  })();

  const renderMatrixValue = (cell: any, type: 'yearEndTarget' | 'rollingYearEnd') => {
    if (cell?.completed) return '-';

    if (type === 'yearEndTarget') {
      return formatCurrency(cell?.year_end_target_stock);
    }
    return formatCurrency(cell?.rolling_year_end_stock);
  };

  const isThirdYearBucket = (bucket: string) => bucket === '3년차 이상';
  const detailButtonLabel =
    language === 'ko'
      ? '상세보기'
      : 'Show details';

  const detailLegend = {
    sales: language === 'ko' ? '소진: 실적 / 목표' : 'Sales: Actual / Target',
    stock: language === 'ko' ? '재고: 실적 / 목표' : 'Stock: Actual / Target',
    hint:
      language === 'ko'
        ? '셀에 마우스를 올리면 할인율 목표/실적을 볼 수 있습니다.'
        : 'Hover a cell to see actual vs target discount.',
  };

  return (
    <article className="flex h-[540px] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {language === 'ko' ? '과시즌 목표대비 히트맵' : 'Old-season Target Heatmap'}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {language === 'ko'
              ? '목표대비 소진금액 기준 | 행: 의류·악세·전체 / 열: 연차'
              : 'Dep. vs tgt | Wear/Acc/Total by age'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetailModal(true)}
          className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          {detailButtonLabel}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-[76px_repeat(3,minmax(0,1fr))] gap-2">
          <div />
          {colOrder.map((bucket) => (
            <div
              key={bucket}
              className={`group relative rounded-lg px-2 py-2 text-center text-xs font-semibold ${
                isThirdYearBucket(bucket)
                  ? 'border border-amber-200 bg-gradient-to-b from-amber-100 to-amber-50 text-amber-950 shadow-sm'
                  : 'bg-amber-50 text-amber-900'
              }`}
            >
              {yearBucketLabel(bucket, language)}
              {isThirdYearBucket(bucket) ? (
                <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 text-left text-[10px] leading-relaxed text-gray-600 shadow-lg group-hover:block">
                  {thirdYearTooltip}
                </div>
              ) : null}
            </div>
          ))}

          {rowOrder.map((rowMeta) => (
            <div key={rowMeta.key} className="contents">
              <div className="flex items-center justify-center rounded-lg bg-gray-50 px-2 text-xs font-semibold text-gray-700">
                {rowMeta.label}
              </div>
              {colOrder.map((bucket) => {
                const cell = cellMap.get(`${rowMeta.key}:${bucket}`);
                const isCompleted = Boolean(cell?.completed);
                const isAvailable = Boolean(cell?.available);

                return (
                  <div
                    key={`${rowMeta.key}-${bucket}`}
                    className={`group relative rounded-xl border p-3 text-center ${toneClass(
                      cell?.progress_pct,
                      cell?.projected_progress_pct,
                      isCompleted
                    )}`}
                  >
                    <p className="text-lg font-bold leading-tight">
                      {isCompleted
                        ? language === 'ko'
                          ? '완료'
                          : 'Done'
                        : isAvailable
                          ? formatPercent(cell?.progress_pct, 0)
                          : 'N/A'}
                    </p>
                    <p className="mt-1 whitespace-nowrap text-[11px] font-medium">
                      {isCompleted
                        ? language === 'ko'
                          ? '소진완료'
                          : 'Cleared'
                        : `${language === 'ko' ? '월말' : 'M-end'} ${formatPercent(
                            cell?.projected_progress_pct,
                            0
                          )}`}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left text-[11px] leading-relaxed text-gray-700 shadow-lg group-hover:block">
                      <p>{language === 'ko' ? '소진금액' : 'Depleted'} {formatCurrency(cell?.actual_sold_amt)}</p>
                      <p>{language === 'ko' ? '목표금액' : 'Target'} {formatCurrency(cell?.target_sold_gross)}</p>
                      <p>{language === 'ko' ? '진척률' : 'Progress'} {formatPercent(cell?.progress_pct, 1)}</p>
                      <p>{language === 'ko' ? '월말환산' : 'M-end'} {formatPercent(cell?.projected_progress_pct, 1)}</p>
                      <p>
                        {language === 'ko' ? '할인율' : 'Discount'}{' '}
                        {formatPercent(
                          cell?.actual_discount_rate !== null ? cell?.actual_discount_rate * 100 : null,
                          1
                        )}
                      </p>
                      <p>{language === 'ko' ? '목표대비' : 'vs Target'} {formatSignedPp(cell?.discount_delta_pct)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col rounded-2xl border border-gray-100 bg-gray-50/55 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold tracking-[0.04em] text-gray-500">
                {language === 'ko' ? '목표대비 연말재고(TAG)' : 'YE Stock vs Tgt (TAG)'}
              </p>
              {rollingVsTargetPct !== null ? (
                <>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${rollingVsTargetTone}`}>
                    {rollingVsTargetPct.toFixed(0)}%
                  </span>
                  {rollingVsTargetLabel ? (
                    <span
                      className={`text-[10px] font-medium ${
                        rollingVsTargetPct > 100
                          ? 'text-rose-600'
                          : rollingVsTargetPct < 100
                            ? 'text-emerald-600'
                            : 'text-gray-500'
                      }`}
                    >
                      {rollingVsTargetLabel}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
            <p className="text-[9px] text-gray-400">
              {language === 'ko' ? '롤링 / 목표' : 'Roll / Tgt'}
            </p>
          </div>

          <div className="grid grid-cols-[64px_repeat(3,minmax(0,1fr))] gap-1.5">
            <div />
            {colOrder.map((bucket) => (
              <div
                key={`detail-${bucket}`}
                className={`group relative rounded-md px-1.5 py-1 text-center text-[10px] font-semibold shadow-sm ${
                  isThirdYearBucket(bucket)
                    ? 'border border-amber-200 bg-gradient-to-b from-amber-50 to-white text-amber-950'
                    : 'bg-white text-gray-700'
                }`}
              >
                {yearBucketLabel(bucket, language)}
                {isThirdYearBucket(bucket) ? (
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 text-left text-[10px] leading-relaxed text-gray-600 shadow-lg group-hover:block">
                    {thirdYearTooltip}
                  </div>
                ) : null}
              </div>
            ))}

            {rowOrder.map((rowMeta) => (
              <div key={`detail-${rowMeta.key}`} className="contents">
                <div className="flex items-center justify-center rounded-md bg-white px-1.5 text-[10px] font-semibold text-gray-700 shadow-sm">
                  {rowMeta.label}
                </div>
                {colOrder.map((bucket) => {
                  const cell = cellMap.get(`${rowMeta.key}:${bucket}`);

                  return (
                    <div
                      key={`detail-${rowMeta.key}-${bucket}`}
                      className={`group relative rounded-md border px-1.5 py-1.5 shadow-sm ${
                        isThirdYearBucket(bucket)
                          ? 'border-amber-200 bg-amber-50/60'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <p
                        className={`text-[10px] font-semibold leading-tight ${
                          typeof cell?.rolling_year_end_gap === 'number'
                            ? cell.rolling_year_end_gap > 0
                              ? 'text-rose-600'
                              : cell.rolling_year_end_gap < 0
                                ? 'text-emerald-600'
                                : 'text-gray-900'
                            : 'text-gray-900'
                        }`}
                      >
                        {renderMatrixValue(cell, 'rollingYearEnd')} / {renderMatrixValue(cell, 'yearEndTarget')}
                      </p>
                      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 text-left text-[10px] leading-relaxed text-gray-600 shadow-lg group-hover:block">
                        <p>
                          {language === 'ko'
                            ? `롤링: 1/1~${asofDateLabel} 실적, 이후 목표금액 반영 후 기말재고`
                            : `Rolling: year-end stock using actuals from 1/1 to ${asofDateLabel} and target amounts afterward`}
                        </p>
                        <p>
                          {language === 'ko'
                            ? '목표: 2026년 1년 소진목표 반영 후 기말재고'
                            : 'Target: year-end stock after applying the 2026 full-year depletion target'}
                        </p>
                        {isThirdYearBucket(bucket) ? <p>{thirdYearTooltip}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showDetailModal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {language === 'ko' ? '과시즌 목표 상세 매트릭스' : 'Old-season Target Detail Matrix'}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {language === 'ko'
                    ? '항목별 소진/재고의 실적과 목표를 함께 비교합니다.'
                    : 'Compare sales and stock actuals against targets by item.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                {language === 'ko' ? '닫기' : 'Close'}
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                  {detailLegend.sales}
                </span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                  {detailLegend.stock}
                </span>
                <span>{detailLegend.hint}</span>
              </div>

              <div className="grid grid-cols-[88px_repeat(3,minmax(0,1fr))] gap-2">
                <div />
                {colOrder.map((bucket) => (
                  <div
                    key={`modal-${bucket}`}
                    className={`group relative rounded-lg px-3 py-2 text-center text-sm font-semibold shadow-sm ${
                      isThirdYearBucket(bucket)
                        ? 'border border-amber-200 bg-gradient-to-b from-amber-50 to-white text-amber-950'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {yearBucketLabel(bucket, language)}
                    {isThirdYearBucket(bucket) ? (
                      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-52 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 text-left text-[10px] leading-relaxed text-gray-600 shadow-lg group-hover:block">
                        {thirdYearTooltip}
                      </div>
                    ) : null}
                  </div>
                ))}

                {rowOrder.map((rowMeta) => (
                  <div key={`modal-${rowMeta.key}`} className="contents">
                    <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-sm font-semibold text-gray-700">
                      {rowMeta.label}
                    </div>
                    {colOrder.map((bucket) => {
                      const cell = cellMap.get(`${rowMeta.key}:${bucket}`);
                      const stockTone =
                        typeof cell?.rolling_year_end_gap === 'number'
                          ? cell.rolling_year_end_gap > 0
                            ? 'text-rose-600'
                            : cell.rolling_year_end_gap < 0
                              ? 'text-emerald-600'
                              : 'text-gray-900'
                          : 'text-gray-900';

                      return (
                        <div
                          key={`modal-${rowMeta.key}-${bucket}`}
                          className={`group relative rounded-xl border p-3 shadow-sm ${
                            isThirdYearBucket(bucket)
                              ? 'border-amber-200 bg-amber-50/50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="space-y-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-emerald-600">
                                {language === 'ko' ? '소진' : 'Sales'}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                                {formatCurrency(cell?.actual_sold_amt)} / {formatCurrency(cell?.target_sold_gross)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-sky-600">
                                {language === 'ko' ? '재고' : 'Stock'}
                              </p>
                              <p className={`mt-0.5 text-sm font-semibold ${stockTone}`}>
                                {renderMatrixValue(cell, 'rollingYearEnd')} / {renderMatrixValue(cell, 'yearEndTarget')}
                              </p>
                            </div>
                          </div>

                          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left text-[11px] leading-relaxed text-gray-600 shadow-lg group-hover:block">
                            <p>{language === 'ko' ? '소진 실적' : 'Sales actual'}: {formatCurrency(cell?.actual_sold_amt)}</p>
                            <p>{language === 'ko' ? '소진 목표' : 'Sales target'}: {formatCurrency(cell?.target_sold_gross)}</p>
                            <p>{language === 'ko' ? '재고 실적' : 'Stock actual'}: {renderMatrixValue(cell, 'rollingYearEnd')}</p>
                            <p>{language === 'ko' ? '재고 목표' : 'Stock target'}: {renderMatrixValue(cell, 'yearEndTarget')}</p>
                            <p>
                              {language === 'ko' ? '할인율 실적' : 'Discount actual'}:{' '}
                              {formatPercent(
                                cell?.actual_discount_rate !== null ? cell?.actual_discount_rate * 100 : null,
                                1
                              )}
                            </p>
                            <p>
                              {language === 'ko' ? '할인율 목표' : 'Discount target'}:{' '}
                              {formatPercent(
                                cell?.target_discount_rate !== null ? cell?.target_discount_rate * 100 : null,
                                1
                              )}
                            </p>
                            <p>{language === 'ko' ? '할인율 차이' : 'Discount delta'}: {formatSignedPp(cell?.discount_delta_pct)}</p>
                            <p>
                              {language === 'ko'
                                ? `재고 실적은 1/1~${asofDateLabel} 실적 반영 기준 롤링 값입니다.`
                                : `Stock actual is a rolling year-end value using actuals through ${asofDateLabel}.`}
                            </p>
                            {isThirdYearBucket(bucket) ? <p>{thirdYearTooltip}</p> : null}
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
