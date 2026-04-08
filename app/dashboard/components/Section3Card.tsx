'use client';
import { useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
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
  const isCompactEnglish = fixedHeight && language === 'en';
  type InventorySegmentCard = {
    key: string;
    label: string;
    curr_stock_amt: number;
    ly_curr_stock_amt: number | null;
    yoy_pct: number | null;
    breakdown?: Array<{
      label_key: string;
      curr_stock_amt: number;
      ly_curr_stock_amt: number | null;
      yoy_pct: number | null;
      category_nodes?: Array<{
        cat2: string;
        curr_stock_amt: number;
        ly_curr_stock_amt?: number | null;
        yoy_pct?: number | null;
      }>;
    }>;
  };
  const [selectedInventoryCard, setSelectedInventoryCard] = useState<InventorySegmentCard | null>(null);
  const [selectedInventoryNode, setSelectedInventoryNode] = useState<{
    name: string;
    categoryNodes: Array<{ cat2: string; curr_stock_amt: number; ly_curr_stock_amt?: number | null; yoy_pct?: number | null }>;
  } | null>(null);

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
  const getProgressCardTone = (progressPct: number | null | undefined, projectedPct: number | null | undefined) => {
    const effectivePct = projectedPct ?? progressPct;
    if (effectivePct === null || effectivePct === undefined || !Number.isFinite(effectivePct)) {
      return 'border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm';
    }
    if (effectivePct >= 100) {
      return 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-green-50 shadow-[0_10px_24px_rgba(16,185,129,0.10)]';
    }
    if (effectivePct >= 85) {
      return 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-[0_10px_24px_rgba(245,158,11,0.10)]';
    }
    return 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-red-50 shadow-[0_10px_24px_rgba(244,63,94,0.10)]';
  };

  const getSection3SeasonType = () => {
    if (!section3Data?.season_type) return '';
    return section3Data.season_type;
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
    if (language === 'ko') return '월목표';
    return isCompactEnglish ? 'Monthly' : 'Monthly Target';
  };

  const getProjectionLabel = () => {
    if (language === 'ko') return '월말환산';
    return isCompactEnglish ? 'Proj.' : 'Projected';
  };
  const getKpiLabel = (kind: 'currentStock' | 'depletedStock' | 'progress' | 'stagnantRatio') => {
    if (language === 'ko') {
      if (kind === 'currentStock') return t(language, 'currentStock');
      if (kind === 'depletedStock') return t(language, 'depletedStock');
      if (kind === 'progress') return '목표대비 진척률';
      return t(language, 'stagnantRatio');
    }
    if (!isCompactEnglish) {
      if (kind === 'currentStock') return t(language, 'currentStock');
      if (kind === 'depletedStock') return t(language, 'depletedStock');
      if (kind === 'progress') return 'Progress vs Target';
      return t(language, 'stagnantRatio');
    }
    if (kind === 'currentStock') return 'Current Stock';
    if (kind === 'depletedStock') return 'Depleted Stock';
    if (kind === 'progress') return 'Progress vs Tgt';
    return 'Stagnant Ratio';
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
        label: getKpiLabel('currentStock'),
        value: formatCurrency(currentStock),
        badge:
          currentStockYoyPct !== null && currentStockYoyPct !== undefined
            ? `YoY ${currentStockYoyPct.toFixed(1)}%`
            : 'YoY -',
        badgeClass:
          currentStockYoyPct !== null && currentStockYoyPct !== undefined
            ? metricTone(currentStockYoyPct, 100)
            : 'text-gray-700 bg-gray-100',
        extraBadge: `${language === 'ko' ? '정체비중' : isCompactEnglish ? 'Stag.' : 'Stagnant'} ${stagnantRatio.toFixed(1)}%`,
        extraBadgeClass: 'text-red-700 bg-red-50',
        meta: [],
      },
      k2: {
        label: getKpiLabel('depletedStock'),
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
            label: `${getKpiLabel('progress')} (${getTargetModeLabel()})`,
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
            label: getKpiLabel('stagnantRatio'),
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
  const getBottomCardClassName = (key: string) => {
    if (key === 'stagnant') {
      return 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-[0_8px_24px_rgba(244,63,94,0.08)]';
    }
    return 'border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm';
  };
  const getBottomProgressCardClassName = (
    key: string,
    progressPct: number | null | undefined,
    projectedPct: number | null | undefined
  ) => {
    if (key === 'stagnant') {
      return getBottomCardClassName(key);
    }
    return getProgressCardTone(progressPct, projectedPct);
  };
  const getBottomCardTitleClassName = (key: string) => {
    return key === 'stagnant' ? 'text-rose-900' : 'text-gray-800';
  };
  const getBottomCardValueClassName = (key: string) => {
    return key === 'stagnant' ? 'text-rose-950' : 'text-gray-900';
  };
  const inventorySegmentCards: InventorySegmentCard[] = Array.isArray(section3Data?.inventory_segment_cards)
    ? section3Data.inventory_segment_cards
    : [];
  const orderedInventorySegmentCards = (() => {
    const isSsSeason = String(section3Data?.season_type || '').toUpperCase().includes('SS');
    const seasonOrder = isSsSeason
      ? ['current_s', 'current_f', 'past_s', 'past_f']
      : ['current_f', 'current_s', 'past_f', 'past_s'];
    const categoryOrder = ['hat', 'shoes', 'bag', 'acc'];
    const order = [...seasonOrder, ...categoryOrder];
    const orderMap = new Map(order.map((key, index) => [key, index]));
    return [...inventorySegmentCards].sort(
      (a, b) => (orderMap.get(a.key) ?? 999) - (orderMap.get(b.key) ?? 999)
    );
  })();
  const getInventoryYoyTone = (yoy: number | null | undefined) => {
    if (yoy === null || yoy === undefined || !Number.isFinite(yoy)) return 'text-gray-500';
    if (yoy > 100) return 'text-rose-600';
    if (yoy < 100) return 'text-emerald-600';
    return 'text-gray-600';
  };
  const getInventoryCardTooltip = (key: string) =>
    ['current_s', 'current_f', 'past_s', 'past_f'].includes(key)
      ? language === 'ko'
        ? '의류만'
        : 'Apparel only'
      : null;
  const getInventoryBreakdownLabel = (labelKey: string) => {
    if (language === 'ko') {
      const labels: Record<string, string> = {
        current: '현재시즌',
        y1: '1년차',
        y2: '2년차',
        y3_plus: '3년차+',
        current_s: '당시즌S',
        current_f: '당시즌F',
        current_n: '당시즌N',
        past_s: '과시즌S',
        past_f: '과시즌F',
        past_n: '과시즌N',
      };
      return labels[labelKey] || labelKey;
    }
    const labels: Record<string, string> = {
      current: 'Current',
      y1: 'Year 1',
      y2: 'Year 2',
      y3_plus: 'Year 3+',
      current_s: 'Current S',
      current_f: 'Current F',
      current_n: 'Current N',
      past_s: 'Old S',
      past_f: 'Old F',
      past_n: 'Old N',
    };
    return labels[labelKey] || labelKey;
  };
  const getInventoryCardLabel = (key: string, fallbackLabel: string) => {
    if (language === 'ko') return fallbackLabel;
    const labels: Record<string, string> = {
      current_s: 'Current S',
      current_f: 'Current F',
      current_n: 'Current N',
      past_s: 'Old S',
      past_f: 'Old F',
      past_n: 'Old N',
      hat: isCompactEnglish ? 'Hat' : 'Headwear',
      shoes: 'Shoes',
      bag: 'Bag',
      acc: 'Others',
    };
    return labels[key] || fallbackLabel;
  };
  const getInventoryTreemapColor = (yoy: number | null | undefined) => {
    if (yoy === null || yoy === undefined || !Number.isFinite(yoy)) return '#E5E7EB';
    if (yoy >= 130) return '#FCA5A5';
    if (yoy >= 100) return '#FCD34D';
    if (yoy >= 70) return '#86EFAC';
    return '#BFDBFE';
  };
  const selectedInventoryTreemapData =
    selectedInventoryNode
      ? selectedInventoryNode.categoryNodes
          .map((item) => ({
            name: item.cat2,
            value: Math.max(item.curr_stock_amt || 0, 1),
            rawValue: item.curr_stock_amt || 0,
            yoy: item.yoy_pct ?? null,
            fill: getInventoryTreemapColor(item.yoy_pct ?? null),
            categoryNodes: [],
          }))
          .sort((a, b) => (b.rawValue - a.rawValue) || a.name.localeCompare(b.name))
      : selectedInventoryCard?.breakdown
          ?.map((item) => ({
            name: getInventoryBreakdownLabel(item.label_key),
            value: Math.max(item.curr_stock_amt || 0, 1),
            rawValue: item.curr_stock_amt || 0,
            yoy: item.yoy_pct,
            fill: getInventoryTreemapColor(item.yoy_pct),
            categoryNodes: item.category_nodes || [],
          }))
          .sort((a, b) => (b.rawValue - a.rawValue) || a.name.localeCompare(b.name)) || [];
  const InventoryTreemapTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const datum = payload[0]?.payload;
    if (!datum) return null;
    const totalRawValue = selectedInventoryTreemapData.reduce(
      (sum, item) => sum + (item.rawValue || 0),
      0
    );
    const sharePct = totalRawValue > 0 ? ((datum.rawValue || 0) / totalRawValue) * 100 : null;

    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-700 shadow-lg">
        <p className="font-semibold text-gray-900">{datum.name}</p>
        <p className="mt-1">{formatCurrency(datum.rawValue || 0)}</p>
        {sharePct !== null ? <p className="mt-1 text-gray-500">비중 {sharePct.toFixed(1)}%</p> : null}
        {datum.yoy !== null && datum.yoy !== undefined ? (
          <p className={`mt-1 ${getInventoryYoyTone(datum.yoy)}`}>YoY {datum.yoy.toFixed(0)}%</p>
        ) : null}
        {!selectedInventoryNode && Array.isArray(datum.categoryNodes) && datum.categoryNodes.length > 0 ? (
          <p className="mt-1 text-[10px] text-gray-500">
            {language === 'ko' ? '클릭하면 카테고리 상세' : 'Click for category detail'}
          </p>
        ) : null}
      </div>
    );
  };
  const renderInventoryTreemapCell = (props: any) => {
    const { x, y, width, height, name, rawValue, yoy, fill, categoryNodes } = props;
    if (width <= 0 || height <= 0) return <g />;

    const showLabel = width >= 58 && height >= 42;
    const showValue = width >= 78 && height >= 52;
    const showYoy = width >= 96 && height >= 64;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={8}
          ry={8}
          fill={fill}
          stroke="#FFFFFF"
          strokeWidth={2}
          onClick={() => {
            if (!selectedInventoryNode && Array.isArray(categoryNodes) && categoryNodes.length > 0) {
              setSelectedInventoryNode({ name, categoryNodes });
            }
          }}
          className={!selectedInventoryNode && Array.isArray(categoryNodes) && categoryNodes.length > 0 ? 'cursor-pointer' : undefined}
        />
        {showLabel ? (
          <text x={centerX} y={centerY - (showValue ? 12 : 0)} textAnchor="middle" fill="#111827" fontSize="12" fontWeight="700" stroke="none">
            {name}
          </text>
        ) : null}
        {showValue ? (
          <text x={centerX} y={centerY + 6} textAnchor="middle" fill="#111827" fontSize="12" fontWeight="700" stroke="none">
            {formatCurrency(rawValue || 0)}
          </text>
        ) : null}
        {showYoy ? (
          <text x={centerX} y={centerY + 22} textAnchor="middle" fill="#065F46" fontSize="10" fontWeight="600" stroke="none">
            {yoy !== null && yoy !== undefined ? `YoY ${yoy.toFixed(0)}%` : 'YoY -'}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <article className={`relative ${fixedHeight ? 'h-[452px] overflow-hidden' : ''} rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 shadow-sm sm:p-5`}>
      <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex-1">
          <h3 className={`${isCompactEnglish ? 'text-[15px]' : 'text-base'} font-semibold leading-tight text-gray-900`}>
            {t(language, 'section3Title')}
            {seasonType && <span className="ml-2 text-xs font-medium text-gray-500">({seasonType})</span>}
          </h3>
        </div>

        <div className="w-full shrink-0 text-left sm:w-auto sm:text-right">
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

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[kpis.k1, kpis.k2, kpis.k3].map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 rounded-xl border p-2.5 sm:p-3 ${
              index === 2 && kpis.hasTargetInfo
                ? getProgressCardTone(
                    section3Data?.header?.target_info?.[targetMode]?.progress_pct ?? null,
                    section3Data?.header?.target_info?.[targetMode]?.projected_progress_pct ?? null
                  )
                : index === 0
                ? 'border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50'
                : 'border-gray-200 bg-gradient-to-br from-gray-50 to-white'
            } ${simpleDetail ? 'sm:min-h-[116px]' : 'space-y-1.5'}`}
          >
            <div className={`flex items-start gap-2 ${simpleDetail ? 'min-h-[20px]' : 'min-h-[32px]'}`}>
              <p className={`${isCompactEnglish ? 'text-[11px]' : 'text-xs'} text-gray-600`}>{item.label}</p>
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

      {simpleDetail && orderedInventorySegmentCards.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-[11px] text-gray-500">
            {language === 'ko' ? '현재 재고 (TAG기준)' : isCompactEnglish ? 'Current stock (TAG)' : 'Based on current stock (TAG)'}
          </p>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {orderedInventorySegmentCards.map((card) => (
              <button
                type="button"
                key={card.key}
                onClick={() => {
                  setSelectedInventoryCard(card);
                  setSelectedInventoryNode(null);
                }}
                className="rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md"
              >
                <div className="inline-flex max-w-full">
                  <p className="text-xs font-semibold text-gray-700">{getInventoryCardLabel(card.key, card.label)}</p>
                </div>
                <p className="mt-2 text-lg font-bold leading-tight text-gray-900">
                  {formatCurrency(card.curr_stock_amt || 0)}
                </p>
                <p className={`mt-1 text-[11px] font-medium ${getInventoryYoyTone(card.yoy_pct)}`}>
                  {card.yoy_pct !== null && card.yoy_pct !== undefined
                    ? `YoY ${card.yoy_pct.toFixed(0)}%`
                    : 'YoY -'}
                </p>
                {false && (
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-[11px] text-gray-600 shadow-lg group-hover:block">
                    <p className="mb-2 font-semibold text-gray-800">
                      {language === 'ko' ? '시즌별 재고' : 'Season Breakdown'}
                    </p>
                    <div className="space-y-1.5">
                      {card.breakdown?.map((item) => (
                        <div key={`${card.key}-${item.label_key}`} className="border-b border-gray-100 pb-1 last:border-b-0 last:pb-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-gray-700">{getInventoryBreakdownLabel(item.label_key)}</span>
                            <span className="font-semibold text-gray-900">{formatCurrency(item.curr_stock_amt || 0)}</span>
                          </div>
                          <p className={`mt-0.5 text-[10px] ${getInventoryYoyTone(item.yoy_pct)}`}>
                            {item.yoy_pct !== null && item.yoy_pct !== undefined
                              ? `YoY ${item.yoy_pct.toFixed(0)}%`
                              : 'YoY -'}
                          </p>
                        </div>
                      ))}
                    </div>
                    {getInventoryCardTooltip(card.key) ? (
                      <p className="mt-2 border-t border-gray-100 pt-2 text-[10px] text-gray-400">
                        {getInventoryCardTooltip(card.key)}
                      </p>
                    ) : null}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {simpleDetail && selectedInventoryCard && Array.isArray(selectedInventoryCard.breakdown) && selectedInventoryCard.breakdown.length > 0 ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 px-4 backdrop-blur-[1px]" onClick={() => { setSelectedInventoryCard(null); setSelectedInventoryNode(null); }}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {selectedInventoryNode
                    ? `${getInventoryCardLabel(selectedInventoryCard.key, selectedInventoryCard.label)} / ${selectedInventoryNode.name}`
                    : getInventoryCardLabel(selectedInventoryCard.key, selectedInventoryCard.label)}
                </h4>
                <p className="mt-1 text-[11px] text-gray-500">
                  {selectedInventoryNode
                    ? (language === 'ko' ? '2글자 카테고리별 현재 재고입니다.' : 'Current stock by 2-letter category.')
                    : (language === 'ko' ? '시즌별 현재 재고와 YoY입니다.' : 'Current stock and YoY by season bucket.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedInventoryCard(null); setSelectedInventoryNode(null); }}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
              >
                {language === 'ko' ? '닫기' : 'Close'}
              </button>
            </div>
            {selectedInventoryNode ? (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setSelectedInventoryNode(null)}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
                >
                  {language === 'ko' ? '뒤로' : 'Back'}
                </button>
              </div>
            ) : null}
            <div className="h-[320px] overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={selectedInventoryTreemapData}
                  dataKey="value"
                  aspectRatio={4 / 3}
                  stroke="#fff"
                  content={renderInventoryTreemapCell}
                  isAnimationActive={false}
                >
                  <Tooltip content={<InventoryTreemapTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
            {getInventoryCardTooltip(selectedInventoryCard.key) ? (
              <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
                {getInventoryCardTooltip(selectedInventoryCard.key)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!simpleDetail && periodStartInfo && periodInfoPlacement === 'footer' && (
        <div className="mt-1 text-[11px] text-gray-500">
          <span className="ml-2">
            | {language === 'ko' ? `소진재고액 기준 ${periodStartInfo}` : `Depleted-stock period ${periodStartInfo}`}
          </span>
        </div>
      )}

      {!simpleDetail && bottomCards.length > 0 && (
        <div className={`border-t border-gray-100 ${fixedHeight ? 'mt-1 pt-2' : 'mt-1.5 pt-2.5'}`}>
          <div className={`grid grid-cols-1 md:grid-cols-5 ${fixedHeight ? 'gap-1.5' : 'gap-2'}`}>
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
              const progressCardClassName = getBottomProgressCardClassName(card.key, progressPct, projectedPct);

              return (
                <div key={card.key} className={`min-w-0 rounded-lg border ${fixedHeight ? 'p-2.5' : 'p-3'} ${progressCardClassName}`}>
                  <div className={fixedHeight ? 'mb-1.5' : 'mb-2'}>
                    <p className={`${fixedHeight ? 'text-[13px]' : 'text-sm'} font-bold leading-snug ${getBottomCardTitleClassName(card.key)}`}>
                      {card.title}
                      {card.seasonCode ? <span className="text-[11px] font-medium text-gray-500">({card.seasonCode})</span> : null}
                    </p>
                  </div>
                  <p className={`${fixedHeight ? 'text-[15px]' : 'text-lg'} font-bold leading-tight ${getBottomCardValueClassName(card.key)}`}>
                    {card.completed
                      ? language === 'ko'
                        ? '소진완료'
                        : 'Cleared'
                      : formatCurrency(card.stockAmt || 0)}
                  </p>
                  <div className={`${fixedHeight ? 'mt-1.5 space-y-0' : 'mt-2.5 space-y-0.5'}`}>
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
                        {!fixedHeight && Array.isArray(card.breakdown) &&
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
                        {language === 'ko' ? '잔여재고 0' : 'No remaining stock'}
                      </p>
                    ) : (
                      <>
                        {fixedHeight ? (
                          <>
                            {renderMetricLine(
                              language === 'ko' ? '소진액' : 'Depleted',
                              formatMillionFixed(card.salesAmt || 0),
                              'text-gray-900',
                              undefined,
                              'text-[11px]'
                            )}
                            {yoyText
                              ? renderMetricLine(
                                  language === 'ko' ? 'YoY' : 'YoY',
                                  yoyText.replace('YoY ', ''),
                                  card.salesYoyPct !== null && card.salesYoyPct >= 100 ? 'text-green-600' : 'text-red-600'
                                )
                              : renderMetricLine(
                                  language === 'ko' ? '진척률' : 'Progress',
                                  formatPercent(progressPct, 1),
                                  progressPct !== null && progressPct >= 100 ? 'text-green-600' : 'text-gray-900'
                                )}
                            {renderMetricLine(
                              getProjectionLabel(),
                              formatPercent(projectedPct, 1),
                              projectedPct !== null && projectedPct >= 100 ? 'text-green-600' : 'text-red-600'
                            )}
                          </>
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
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!simpleDetail && (
        <div className="mt-4 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
          {currencyUnit} | {t(language, 'tagBasis')}
        </div>
      )}
    </article>
  );
}
