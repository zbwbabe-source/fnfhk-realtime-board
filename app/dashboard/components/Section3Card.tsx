'use client';

import { t, type Language } from '@/lib/translations';

interface Section3CardProps {
  section3Data: any;
  language: Language;
  region: string;
  categoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  periodInfoPlacement?: 'inline' | 'footer';
  compactMainMetric?: boolean;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
  simpleDetail?: boolean;
  fixedHeight?: boolean;
}

export default function Section3Card({
  section3Data,
  language,
  region,
  categoryFilter,
  onCategoryFilterChange,
  periodInfoPlacement = 'inline',
  compactMainMetric = false,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
  simpleDetail = false,
  fixedHeight = false,
}: Section3CardProps) {
  const getYearBucketRank = (raw: string | null | undefined) => {
    if (!raw) return null;
    if (raw.includes('3')) return 3;
    if (raw.includes('2')) return 2;
    if (raw.includes('1')) return 1;
    return null;
  };
  const getYearBucketLabel = (raw: string | null | undefined) => {
    const rank = getYearBucketRank(raw);
    if (rank === 1) return language === 'ko' ? '1년차' : 'Y1';
    if (rank === 2) return language === 'ko' ? '2년차' : 'Y2';
    if (rank === 3) return language === 'ko' ? '3년차' : 'Y3';
    return raw || '';
  };

  const targetMode: 'monthly' = 'monthly';
  const formatCurrency = (num: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? num * hkdToTwdRate : num;
    if (converted >= 1000000) return `${(converted / 1000000).toFixed(1)}M`;
    if (converted >= 1000) return `${(converted / 1000).toFixed(1)}K`;
    return converted.toFixed(0);
  };
  const formatMillionFixed = (num: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? num * hkdToTwdRate : num;
    return `${(converted / 1000000).toFixed(1)}M`;
  };

  const formatPercent = (value: number | null | undefined, digits = 1) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    return `${value.toFixed(digits)}%`;
  };

  const formatSignedPercentPoint = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%p`;
  };

  const metricTone = (v: number, pivot = 0) => {
    if (v > pivot) return 'text-red-700 bg-red-50';
    if (v < pivot) return 'text-green-700 bg-green-50';
    return 'text-gray-700 bg-gray-100';
  };
  const projectionTone = (v: number | null | undefined) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'text-gray-700 bg-gray-100';
    if (v >= 100) return 'text-green-700 bg-green-50';
    return 'text-red-700 bg-red-50';
  };

  const getSection3SeasonType = () => {
    if (!section3Data?.season_type) return '';
    return `${section3Data.season_type} ${t(language, 'oldSeason')}`;
  };

  const getPeriodStartInfo = () => {
    if (section3Data?.period_start_date && section3Data?.asof_date) {
      const startDate = section3Data.period_start_date;
      const endDate = section3Data.asof_date;
      const startYear = startDate.slice(2, 4);
      const startMonth = startDate.slice(5, 7);
      const startDay = startDate.slice(8, 10);
      const endMonth = endDate.slice(5, 7);
      const endDay = endDate.slice(8, 10);

      return language === 'ko'
        ? `(${startYear}/${parseInt(startMonth, 10)}/${parseInt(startDay, 10)}~${parseInt(endMonth, 10)}/${parseInt(endDay, 10)})`
        : `(${startYear}/${parseInt(startMonth, 10)}/${parseInt(startDay, 10)}~${parseInt(endMonth, 10)}/${parseInt(endDay, 10)})`;
    }

    return '';
  };

  const getTargetModeLabel = () => {
    return language === 'ko' ? '월목표' : 'Monthly Target';
  };

  const getProjectionLabel = () => {
    return language === 'ko' ? '월말환산' : 'Projected';
  };

  const getProjectionTooltip = () => {
    if (language === 'ko') {
      return '당월 누적 소진액을 경과일수 기준으로 월말까지 단순 일할 환산한 값';
    }
    return 'Month-end projection using simple daily run-rate from current month depleted sales';
  };

  const periodStartInfo = getPeriodStartInfo();

  const calculateKPIs = () => {
    if (!section3Data?.header) {
      return {
        k1: { label: t(language, 'currentStock'), value: 'N/A', badge: null as string | null, badgeClass: '', meta: [] as string[] },
        k2: { label: t(language, 'depletedStock'), value: 'N/A', badge: null as string | null, badgeClass: '', meta: [] as string[] },
        k3: { label: language === 'ko' ? '목표대비' : 'vs Target', value: 'N/A', badge: null as string | null, badgeClass: '', meta: [] as string[] },
        hasTargetInfo: false,
      };
    }

    const header = section3Data.header;
    const currentStock = header.curr_stock_amt || 0;
    const currentStockYoyPct = header.curr_stock_yoy_pct as number | null | undefined;
    const inventoryDays = header.inv_days as number | null | undefined;
    const stagnantStock = header.stagnant_stock_amt || 0;
    const stagnantRatio = currentStock > 0 ? (stagnantStock / currentStock) * 100 : 0;
    const prevMonthStagnantRatio = (header.prev_month_stagnant_ratio || 0) * 100;
    const stagnantRatioChange = stagnantRatio - prevMonthStagnantRatio;

    const cumulativeTagSales = header.period_tag_sales || 0;
    const cumulativeActSales = header.period_act_sales || 0;
    const currentMonthTagSales = header.current_month_depleted || 0;
    const currentMonthTagSalesLy = header.current_month_depleted_ly as number | null | undefined;
    const cumulativeDiscountRate =
      cumulativeTagSales > 0 && Number.isFinite(cumulativeActSales) ? (1 - cumulativeActSales / cumulativeTagSales) * 100 : null;
    const currentMonthDiscountRate =
      header.current_month_discount_rate !== null && header.current_month_discount_rate !== undefined
        ? header.current_month_discount_rate * 100
        : null;

    const depletedSalesLy = header.period_tag_sales_ly as number | null | undefined;
    const depletedActLy = header.period_act_sales_ly as number | null | undefined;
    const cumulativeDiscountRateLy =
      depletedSalesLy !== null &&
      depletedSalesLy !== undefined &&
      depletedSalesLy > 0 &&
      depletedActLy !== null &&
      depletedActLy !== undefined &&
      Number.isFinite(depletedActLy)
        ? (1 - depletedActLy / depletedSalesLy) * 100
        : null;
    const cumulativeDiscountRateDiffPct =
      cumulativeDiscountRate !== null && cumulativeDiscountRateLy !== null
        ? cumulativeDiscountRate - cumulativeDiscountRateLy
        : null;
    const yoyBase =
      depletedSalesLy !== null && depletedSalesLy !== undefined && depletedSalesLy > 0
        ? depletedSalesLy
        : depletedActLy !== null && depletedActLy !== undefined && depletedActLy > 0
          ? depletedActLy
          : null;
    const yoyCurrent =
      depletedSalesLy !== null && depletedSalesLy !== undefined && depletedSalesLy > 0
        ? cumulativeTagSales
        : cumulativeActSales;
    const depletedSalesYoyPct = yoyBase !== null ? (yoyCurrent / yoyBase) * 100 : null;
    const currentMonthSalesYoyPct =
      currentMonthTagSalesLy !== null && currentMonthTagSalesLy !== undefined && currentMonthTagSalesLy > 0
        ? (currentMonthTagSales / currentMonthTagSalesLy) * 100
        : null;

    const hasTargetInfo = region === 'HKMC' && !!header.target_info?.available;
    const selectedTarget = hasTargetInfo ? header.target_info[targetMode] : null;
    const monthlyTargetGross = header.target_info?.monthly?.target_sold_gross ?? null;
    const progressPct = selectedTarget?.progress_pct ?? null;
    const projectedProgressPct = selectedTarget?.projected_progress_pct ?? null;
    const actualDiscountPct =
      selectedTarget?.actual_discount_rate !== null && selectedTarget?.actual_discount_rate !== undefined
        ? selectedTarget.actual_discount_rate * 100
        : null;
    const targetDiscountPct =
      selectedTarget?.target_discount_rate !== null && selectedTarget?.target_discount_rate !== undefined
        ? selectedTarget.target_discount_rate * 100
        : null;
    const discountRateDeltaPct =
      actualDiscountPct !== null && targetDiscountPct !== null ? actualDiscountPct - targetDiscountPct : null;

    return {
      k1: {
        label: t(language, 'currentStock'),
        value: formatCurrency(currentStock),
        badge:
          currentStockYoyPct !== null && currentStockYoyPct !== undefined
            ? `YoY ${currentStockYoyPct.toFixed(1)}%`
            : 'YoY -',
        badgeClass:
          currentStockYoyPct !== null && currentStockYoyPct !== undefined
            ? metricTone(currentStockYoyPct, 100)
            : 'text-gray-700 bg-gray-100',
        extraBadge: `${language === 'ko' ? '정체비중' : 'Stagnant'} ${stagnantRatio.toFixed(1)}%`,
        extraBadgeClass: 'text-red-700 bg-red-50',
        meta: [],
      },
      k2: {
        label: t(language, 'depletedStock'),
        value: formatCurrency(cumulativeTagSales),
        badge:
          currentMonthTagSales > 0
            ? hasTargetInfo && monthlyTargetGross
              ? `${language === 'ko' ? '당월' : 'MTD'} ${formatCurrency(currentMonthTagSales)} / ${language === 'ko' ? '월목표' : 'Tgt'} ${formatCurrency(monthlyTargetGross)}`
              : `${language === 'ko' ? '당월' : 'MTD'} ${formatCurrency(currentMonthTagSales)}`
            : null,
        badgeClass: 'text-orange-700 bg-orange-50',
        meta: [
          `${t(language, 'yoy')} ${formatPercent(depletedSalesYoyPct, 0)}`,
          <span key="k2-discount" className="inline-flex min-h-[28px] flex-col">
            <span>
              {t(language, 'discountRate')}{' '}
              <span className="font-semibold italic text-sky-700">{formatPercent(cumulativeDiscountRate, 1)}</span>
            </span>
            <span
              className={`font-semibold ${
                cumulativeDiscountRateDiffPct !== null
                  ? cumulativeDiscountRateDiffPct > 0
                    ? 'text-rose-600'
                    : cumulativeDiscountRateDiffPct < 0
                      ? 'text-emerald-600'
                      : 'text-gray-500'
                  : 'text-gray-500'
              }`}
            >
              {language === 'ko' ? '전년비 ' : 'vs LY '}
              {formatSignedPercentPoint(cumulativeDiscountRateDiffPct)}
            </span>
          </span>,
        ],
      },
      k3: hasTargetInfo
        ? {
            label: `${language === 'ko' ? '목표대비 진척률' : 'Progress vs Target'} (${getTargetModeLabel()})`,
            value: formatPercent(progressPct, 1),
            badge:
              projectedProgressPct !== null && projectedProgressPct !== undefined
                ? `${getProjectionLabel()} ${formatPercent(projectedProgressPct, 1)}`
                : null,
            badgeClass: projectionTone(projectedProgressPct),
            meta: [
              <span key="k3-discount" className="inline-flex min-h-[28px] flex-col">
                <span>
                  {language === 'ko' ? '할인율' : 'Discount'}{' '}
                  <span className="font-semibold italic text-sky-700">{formatPercent(actualDiscountPct, 1)}</span>
                </span>
                <span className="font-semibold italic text-sky-700">
                  {discountRateDeltaPct !== null && discountRateDeltaPct !== undefined
                    ? `${language === 'ko' ? `(목표대비 ${formatSignedPercentPoint(discountRateDeltaPct)})` : `(vs target ${formatSignedPercentPoint(discountRateDeltaPct)})`}`
                    : ''}
                </span>
              </span>,
            ],
          }
        : {
            label: t(language, 'stagnantRatio'),
            value: `${stagnantRatio.toFixed(1)}%`,
            badge: stagnantRatioChange !== 0 ? formatSignedPercentPoint(stagnantRatioChange) : null,
            badgeClass: metricTone(stagnantRatioChange, 0),
            meta: [
              `${t(language, 'vsLastMonthEnd')} ${formatSignedPercentPoint(stagnantRatioChange)}`,
            ],
          },
      hasTargetInfo,
    };
  };

  const kpis = calculateKPIs();
  const stagnantRatioRisk =
    section3Data?.header?.curr_stock_amt > 0
      ? (section3Data.header.stagnant_stock_amt / section3Data.header.curr_stock_amt) * 100
      : 0;
  const showRiskBadge = stagnantRatioRisk >= 30;
  const seasonType = getSection3SeasonType();
  const currencyUnit =
    region === 'TW'
      ? language === 'ko'
        ? `단위: ${currencyCode}`
        : `Unit: ${currencyCode}`
      : t(language, 'cardUnit');
  const summaryCards = section3Data?.summary_cards;
  const yearCards = summaryCards?.year_cards || [];
  const normalizedYearCards = (() => {
    const cards = [...yearCards];
    const hasThirdYearCard = cards.some((card: any) => getYearBucketRank(card?.year_bucket) === 3);
    if (region === 'TW' && !hasThirdYearCard) {
      cards.push({
        year_bucket: '3년차 이상',
        season_code: '',
        curr_stock_amt: 0,
        stagnant_stock_amt: 0,
        period_tag_sales: 0,
        sales_yoy_pct: null,
        discount_rate: null,
        target_info: null,
        completed: true,
      });
    }
    return cards;
  })();
  const bottomCards = summaryCards
    ? [
        {
          key: 'all',
          title: language === 'ko' ? '전체' : 'Total',
          seasonCode: '',
          stockAmt: section3Data?.header?.curr_stock_amt || 0,
          salesAmt: section3Data?.header?.period_tag_sales || 0,
          salesYoyPct: section3Data?.header?.period_tag_sales_ly
            ? ((section3Data.header.period_tag_sales / section3Data.header.period_tag_sales_ly) * 100)
            : null,
          targetInfo: section3Data?.header?.target_info?.[targetMode] || null,
          discountRate: section3Data?.header?.discount_rate ?? null,
        },
        ...normalizedYearCards.map((card: any) => ({
          key: card.year_bucket,
          title: getYearBucketLabel(card.year_bucket),
          seasonCode: getYearBucketRank(card.year_bucket) === 3 ? '' : card.season_code,
          stockAmt: card.curr_stock_amt,
          stagnantStockAmt: card.stagnant_stock_amt,
          salesAmt: card.period_tag_sales,
          salesYoyPct: card.sales_yoy_pct,
          targetInfo: card.target_info?.[targetMode] || null,
          discountRate: card.discount_rate,
          completed: !!card.completed,
        })),
        summaryCards.stagnant_card
          ? {
              key: 'stagnant',
              title: language === 'ko' ? '정체재고' : 'Stagnant Stock',
              seasonCode: '',
              stockAmt: summaryCards.stagnant_card.stagnant_stock_amt,
              salesAmt: null,
              salesYoyPct: null,
              targetInfo: null,
              discountRate: null,
              stagnantRatio: summaryCards.stagnant_card.stagnant_ratio,
              prevMonthStagnantRatio: summaryCards.stagnant_card.prev_month_stagnant_ratio,
              invDays: summaryCards.stagnant_card.inv_days,
              breakdown: normalizedYearCards.map((yearCard: any) => ({
                label: getYearBucketLabel(yearCard.year_bucket),
                value: yearCard.stagnant_stock_amt,
              })),
            }
          : null,
      ].filter(Boolean)
    : [];

  const renderMetricLine = (
    label: string,
    value: string,
    accentClass = 'text-gray-900',
    suffix?: string,
    textClass = 'text-[11px]'
  ) => (
    <p className={`${textClass} leading-tight text-gray-600`}>
      <span>{label} </span>
      <span className={`font-semibold ${accentClass}`}>{value}</span>
      {suffix ? <span className="ml-1">{suffix}</span> : null}
    </p>
  );
  const renderDiscountLine = (
    label: string,
    rate: string,
    deltaText?: string,
    deltaClass = 'text-gray-600',
    textClass = 'text-[11px]'
  ) => (
    <div className={`${textClass} leading-tight text-gray-600`}>
      <p>
        <span>{label} </span>
        <span className="font-semibold italic text-sky-700">{rate}</span>
      </p>
      {deltaText ? <p className={`font-semibold ${deltaClass}`}>{deltaText}</p> : null}
    </div>
  );

  return (
    <article className={`${fixedHeight ? 'min-h-[292px]' : ''} rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 shadow-sm sm:p-5`}>
      <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex-1">
          <h3 className="text-base font-semibold leading-tight text-gray-900">
            {t(language, 'section3Title')}
            {seasonType && <span className="ml-2 text-xs font-medium text-gray-500">({seasonType})</span>}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section3Subtitle')}</p>
        </div>

        <div className="w-full shrink-0 space-y-1.5 text-left sm:w-auto sm:text-right">
          <p className="text-xs text-gray-500 sm:text-right">{t(language, 'filterCategory')}</p>
          <div className="space-y-1.5">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => onCategoryFilterChange('clothes')}
                className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  categoryFilter === 'clothes' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'clothesOnly')}
              </button>
              <button
                onClick={() => onCategoryFilterChange('all')}
                className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  categoryFilter === 'all' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'allCategory')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[kpis.k1, kpis.k2, kpis.k3].map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 rounded-xl border p-2.5 sm:p-3 ${
              index === 0
                ? 'border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50'
                : 'border-gray-200 bg-gradient-to-br from-gray-50 to-white'
            } ${simpleDetail ? 'sm:min-h-[116px]' : 'space-y-1.5'}`}
          >
            <div className={`flex items-start gap-2 ${simpleDetail ? 'min-h-[20px]' : 'min-h-[32px]'}`}>
              <p className="text-xs text-gray-600">{item.label}</p>
            </div>
            <div className={`${simpleDetail ? 'min-h-[20px]' : 'min-h-[16px]'} text-[11px] leading-tight`}>
              {index === 1 && periodStartInfo
                ? (
                    <span className="inline-block rounded-md bg-orange-50 px-2 py-0.5 font-medium text-orange-900">
                      {language === 'ko'
                        ? `소진기간 ${periodStartInfo.replace(/^\(|\)$/g, '')}`
                        : `Period ${periodStartInfo.replace(/^\(|\)$/g, '')}`}
                    </span>
                  )
                : null}
            </div>
            <p className={`${simpleDetail ? 'mt-1 text-2xl' : compactMainMetric ? 'text-lg sm:text-xl' : 'text-[1.7rem] sm:text-[2rem]'} font-bold leading-tight tabular-nums text-gray-900`}>
              {item.value}
            </p>
            {!simpleDetail && item.badge && (
              index === 2 ? (
                <span className="group relative inline-block">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${item.badgeClass}`}>
                    {item.badge}
                  </span>
                  <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] leading-snug text-gray-600 shadow-md group-hover:block">
                    {getProjectionTooltip()}
                  </span>
                </span>
              ) : (
                <span className={`inline-block max-w-full rounded-md px-2 py-0.5 text-[11px] font-medium leading-tight break-words ${item.badgeClass}`}>
                  {item.badge}
                </span>
              )
            )}
            {!simpleDetail && (item as any).extraBadge && (
              <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${(item as any).extraBadgeClass || 'text-gray-700 bg-gray-100'}`}>
                {(item as any).extraBadge}
              </span>
            )}
            {!simpleDetail && item.meta.map((line: any, metaIndex: number) => (
              <p key={metaIndex} className="text-[11px] leading-tight text-gray-500">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      {!simpleDetail && periodStartInfo && periodInfoPlacement === 'footer' && (
        <div className="mt-1 text-[11px] text-gray-500">
          <span className="ml-2">
            | {language === 'ko' ? `소진재고액 기준 ${periodStartInfo}` : `Depleted-stock period ${periodStartInfo}`}
          </span>
        </div>
      )}

      {!simpleDetail && bottomCards.length > 0 && (
        <div className="mt-1.5 border-t border-gray-100 pt-2.5">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {bottomCards.map((card: any) => {
              const cardDiscountRate =
                card.targetInfo?.actual_discount_rate ?? card.discountRate ?? null;
              const targetDiscountRate = card.targetInfo?.target_discount_rate ?? null;
              const discountDelta =
                cardDiscountRate !== null && targetDiscountRate !== null
                  ? (cardDiscountRate - targetDiscountRate) * 100
                  : null;
              const progressPct = card.targetInfo?.progress_pct ?? null;
              const projectedPct = card.targetInfo?.projected_progress_pct ?? null;
              const yoyText =
                card.salesYoyPct !== null && card.salesYoyPct !== undefined
                  ? `YoY ${formatPercent(card.salesYoyPct, 0)}`
                  : null;
              const discountCombinedLabel = language === 'ko' ? '할인율(목표비)' : 'Discount (vs Target)';

              return (
                <div key={card.key} className="min-w-0 rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 shadow-sm">
                  <div className="mb-2">
                    <p className="text-sm font-bold leading-snug text-gray-800">
                      {card.title}
                      {card.seasonCode ? <span className="text-[11px] font-medium text-gray-500">({card.seasonCode})</span> : null}
                    </p>
                  </div>
                  <p className="text-lg font-bold leading-tight text-gray-900">
                    {card.completed
                      ? language === 'ko'
                        ? '소진완료'
                        : 'Cleared'
                      : formatCurrency(card.stockAmt || 0)}
                  </p>
                  <div className="mt-2.5 space-y-0.5">
                    {card.key === 'stagnant' ? (
                      <>
                        {renderMetricLine(
                          language === 'ko' ? '정체비중' : 'Stagnant Ratio',
                          formatPercent((card.stagnantRatio ?? 0) * 100, 1),
                          'text-gray-900'
                        )}
                        {renderMetricLine(
                          t(language, 'vsLastMonthEnd'),
                          formatSignedPercentPoint(((card.stagnantRatio ?? 0) - (card.prevMonthStagnantRatio ?? 0)) * 100),
                          ((card.stagnantRatio ?? 0) - (card.prevMonthStagnantRatio ?? 0)) * 100 > 0 ? 'text-red-600' : 'text-green-600'
                        )}
                        {Array.isArray(card.breakdown) &&
                          card.breakdown.map((item: any) =>
                            renderMetricLine(
                              item.label,
                              formatCurrency(item.value || 0),
                              'text-gray-900'
                            )
                          )}
                      </>
                    ) : card.completed ? (
                      <p className="text-[12px] leading-tight text-emerald-600">
                        {language === 'ko' ? '잔여 재고 없음' : 'No remaining stock'}
                      </p>
                    ) : (
                      <>
                        {renderMetricLine(
                          language === 'ko' ? '소진액' : 'Depleted',
                          formatMillionFixed(card.salesAmt || 0),
                          'text-gray-900',
                          undefined,
                          'text-[12px]'
                        )}
                        {yoyText
                          ? renderMetricLine(
                              language === 'ko' ? 'YoY' : 'YoY',
                              yoyText.replace('YoY ', ''),
                              card.salesYoyPct !== null && card.salesYoyPct >= 100 ? 'text-green-600' : 'text-red-600'
                            )
                          : null}
                        {renderMetricLine(
                          language === 'ko' ? '진척률' : 'Progress',
                          formatPercent(progressPct, 1),
                          progressPct !== null && progressPct >= 100 ? 'text-green-600' : 'text-gray-900'
                        )}
                        {renderMetricLine(
                          getProjectionLabel(),
                          formatPercent(projectedPct, 1),
                          projectedPct !== null && projectedPct >= 100 ? 'text-green-600' : 'text-red-600'
                        )}
                        {renderDiscountLine(
                          discountCombinedLabel,
                          formatPercent(cardDiscountRate !== null ? cardDiscountRate * 100 : null, 1),
                          discountDelta !== null ? `(${formatSignedPercentPoint(discountDelta)})` : undefined,
                          discountDelta !== null
                            ? discountDelta > 0
                              ? 'text-red-600'
                              : discountDelta < 0
                                ? 'text-green-600'
                                : 'text-gray-600'
                            : 'text-gray-600'
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        {currencyUnit} | {t(language, 'tagBasis')}
      </div>
    </article>
  );
}
