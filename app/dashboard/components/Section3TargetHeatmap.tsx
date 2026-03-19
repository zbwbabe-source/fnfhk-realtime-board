'use client';

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

const toneClass = (value: number | null | undefined, completed: boolean) => {
  if (completed) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (value === null || value === undefined || !Number.isFinite(value)) return 'bg-gray-50 text-gray-400 border-gray-200';
  if (value >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (value >= 80) return 'bg-amber-50 text-amber-700 border-amber-100';
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

export default function Section3TargetHeatmap({
  section3Data,
  region,
  language,
}: Section3TargetHeatmapProps) {
  if (region !== 'HKMC') return null;

  const heatmap = section3Data?.target_heatmap;
  if (!heatmap?.rows?.length) {
    return (
      <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
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

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">
          {language === 'ko' ? '과시즌 목표대비 히트맵' : 'Old-season Target Heatmap'}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {language === 'ko' ? '행: 의류·악세·전체 / 열: 연차' : 'Rows: wear, accessory, total / Columns: age bucket'}
        </p>
      </div>

      <div className="grid grid-cols-[76px_repeat(3,minmax(0,1fr))] gap-2">
        <div />
        {colOrder.map((bucket) => (
          <div key={bucket} className="text-center text-xs font-semibold text-gray-500">
            {yearBucketLabel(bucket, language)}
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
                  className={`group relative rounded-xl border p-3 text-center ${toneClass(cell?.progress_pct, isCompleted)}`}
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
                  <p className="mt-1 text-[11px] font-medium">
                    {isCompleted
                      ? language === 'ko'
                        ? '소진완료'
                        : 'Cleared'
                      : `${language === 'ko' ? '월말' : 'Month-end'} ${formatPercent(cell?.projected_progress_pct, 0)}`}
                  </p>

                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left text-[11px] leading-relaxed text-gray-700 shadow-lg group-hover:block">
                    <p>{language === 'ko' ? '소진금액' : 'Depleted'} {formatCurrency(cell?.actual_sold_amt)}</p>
                    <p>{language === 'ko' ? '목표금액' : 'Target'} {formatCurrency(cell?.target_sold_gross)}</p>
                    <p>{language === 'ko' ? '진척률' : 'Progress'} {formatPercent(cell?.progress_pct, 1)}</p>
                    <p>{language === 'ko' ? '월말환산' : 'Month-end'} {formatPercent(cell?.projected_progress_pct, 1)}</p>
                    <p>{language === 'ko' ? '할인율' : 'Discount'} {formatPercent(cell?.actual_discount_rate !== null ? cell?.actual_discount_rate * 100 : null, 1)}</p>
                    <p>{language === 'ko' ? '목표대비' : 'vs Target'} {formatSignedPp(cell?.discount_delta_pct)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </article>
  );
}
