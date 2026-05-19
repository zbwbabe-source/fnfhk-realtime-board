'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { getCategoryTooltipText } from '@/lib/category-utils';
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
    sales_amt?: number | null;
    sales_yoy_pct?: number | null;
    breakdown?: Array<{
      label_key: string;
      curr_stock_amt: number;
      ly_curr_stock_amt: number | null;
      yoy_pct: number | null;
      category_nodes?: Array<{
        cat2: string;
        year_bucket?: string;
        curr_stock_amt: number;
        ly_curr_stock_amt?: number | null;
        yoy_pct?: number | null;
        stock_share_pct?: number | null;
        stock_share_diff_pct?: number | null;
        period_tag_sales?: number;
        ly_period_tag_sales?: number | null;
        period_sales_yoy_pct?: number | null;
        current_month_tag_sales?: number;
        ly_current_month_tag_sales?: number | null;
        current_month_sales_yoy_pct?: number | null;
        ytd_tag_sales?: number;
        ly_ytd_tag_sales?: number | null;
        ytd_sales_yoy_pct?: number | null;
        discount_rate?: number | null;
        discount_rate_diff_pct?: number | null;
        current_month_discount_rate?: number | null;
        current_month_discount_rate_diff_pct?: number | null;
        ytd_discount_rate?: number | null;
        ytd_discount_rate_diff_pct?: number | null;
        current_stock_amt?: number | null;
        stagnant_stock_amt?: number | null;
        stagnant_stock_qty?: number | null;
        stagnant_ratio_pct?: number | null;
      }>;
      current_stock_amt?: number | null;
      stagnant_stock_qty?: number | null;
      stagnant_ratio_pct?: number | null;
    }>;
  };
  const [selectedInventoryCard, setSelectedInventoryCard] = useState<InventorySegmentCard | null>(null);
  const [selectedInventoryNode, setSelectedInventoryNode] = useState<{
    name: string;
    categoryNodes: Array<{
      cat2: string;
      year_bucket?: string;
      curr_stock_amt: number;
      ly_curr_stock_amt?: number | null;
      yoy_pct?: number | null;
      stock_share_pct?: number | null;
      stock_share_diff_pct?: number | null;
      period_tag_sales?: number;
      ly_period_tag_sales?: number | null;
      period_sales_yoy_pct?: number | null;
      current_month_tag_sales?: number;
      ly_current_month_tag_sales?: number | null;
      current_month_sales_yoy_pct?: number | null;
      ytd_tag_sales?: number;
      ly_ytd_tag_sales?: number | null;
      ytd_sales_yoy_pct?: number | null;
      discount_rate?: number | null;
      discount_rate_diff_pct?: number | null;
      current_month_discount_rate?: number | null;
      current_month_discount_rate_diff_pct?: number | null;
      ytd_discount_rate?: number | null;
      ytd_discount_rate_diff_pct?: number | null;
      current_stock_amt?: number | null;
      stagnant_stock_qty?: number | null;
      stagnant_ratio_pct?: number | null;
    }>;
  } | null>(null);
  const [selectedInventorySkuNode, setSelectedInventorySkuNode] = useState<{
    name: string;
    rows: Array<{
      prdt_cd: string;
      curr_stock_amt: number;
      stagnant_stock_amt?: number | null;
      stagnant_stock_qty?: number | null;
      stagnant_ratio_pct?: number | null;
      current_stock_amt?: number | null;
    }>;
  } | null>(null);
  const [inventoryCategorySort, setInventoryCategorySort] = useState<{
    key:
      | 'cat2'
      | 'curr_stock_amt'
      | 'yoy_pct'
      | 'share'
      | 'stock_share_diff_pct'
      | 'period_tag_sales'
      | 'period_sales_yoy_pct'
      | 'discount_rate'
      | 'discount_rate_diff_pct'
      | 'stagnant_ratio_pct'
      | 'current_stock_amt'
      | 'stagnant_stock_qty';
    direction: 'asc' | 'desc';
  }>({
    key: 'curr_stock_amt',
    direction: 'desc',
  });
  const inventorySkuSectionRef = useRef<HTMLDivElement | null>(null);
  const [salesPushModalOpen, setSalesPushModalOpen] = useState(false);
  const [salesPushDetailData, setSalesPushDetailData] = useState<any>(null);
  const [salesPushDetailLoading, setSalesPushDetailLoading] = useState(false);
  const [salesPushDetailError, setSalesPushDetailError] = useState<string | null>(null);
  const salesPushDetailRequestKeyRef = useRef<string | null>(null);
  const [excludeUnder10Pcs, setExcludeUnder10Pcs] = useState(true);
  const [selectedSalesPushYear, setSelectedSalesPushYear] = useState<string | null>(null);
  const [selectedSalesPushCategory, setSelectedSalesPushCategory] = useState<string | null>(null);
  const [salesPushYearSort, setSalesPushYearSort] = useState<{
    key: 'year_bucket' | 'amount' | 'share_pct' | 'sku_count' | 'current_stock_amt' | 'ly_sales' | 'ly_sales_qty' | 'sales_rate_pct';
    direction: 'asc' | 'desc';
  }>({
    key: 'sales_rate_pct',
    direction: 'desc',
  });
  const [salesPushCategorySort, setSalesPushCategorySort] = useState<{
    key: 'cat2' | 'amount' | 'share_pct' | 'sku_count' | 'current_stock_amt' | 'ly_sales' | 'ly_sales_qty' | 'sales_rate_pct';
    direction: 'asc' | 'desc';
  }>({
    key: 'sales_rate_pct',
    direction: 'desc',
  });
  const [salesPushSkuSort, setSalesPushSkuSort] = useState<{
    key: 'prdt_cd' | 'sales_push_stagnant_amt' | 'current_stock_amt' | 'ly_push_30d_tag_sales' | 'ly_push_30d_sales_qty' | 'sales_rate_pct';
    direction: 'asc' | 'desc';
  }>({
    key: 'sales_push_stagnant_amt',
    direction: 'desc',
  });
  const [depletionPeriodMode, setDepletionPeriodMode] = useState<'mtd' | 'ytd'>('mtd');

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

  const targetMode: 'monthly' | 'cumulative' = depletionPeriodMode === 'mtd' ? 'monthly' : 'cumulative';
  const formatCurrency = (num: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? num * hkdToTwdRate : num;
    if (converted >= 1000000) return `${(converted / 1000000).toFixed(1)}M`;
    if (converted >= 1000) return `${(converted / 1000).toFixed(1)}K`;
    return converted.toFixed(0);
  };
  const formatSignedCurrency = (num: number | null | undefined) => {
    if (num === null || num === undefined || !Number.isFinite(num)) return '-';
    if (num === 0) return '0';
    const sign = num > 0 ? '+' : '△';
    return `${sign}${formatCurrency(Math.abs(num))}`;
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
  const formatDiscountRateDiff = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    if (value === 0) return '0.0%p';
    const sign = value > 0 ? '+' : '△';
    return `${sign}${Math.abs(value).toFixed(1)}%p`;
  };
  const formatQuantityPcs = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    return `${Math.round(value).toLocaleString('en-US')} pcs`;
  };
  const getMainSeasonTypeFromAsof = () => {
    const asofDate = String(section3Data?.asof_date || '');
    const month = asofDate.length >= 7 ? Number(asofDate.slice(5, 7)) : NaN;
    if (!Number.isFinite(month)) return '';
    return month >= 9 || month <= 2 ? 'F' : 'S';
  };
  const getPeriodStartForMode = () => {
    if (!section3Data?.asof_date) return '';
    const endDate = String(section3Data.asof_date);
    if (depletionPeriodMode === 'mtd') {
      return `${endDate.slice(0, 7)}-01`;
    }
    return `${endDate.slice(0, 4)}-01-01`;
  };
  const getPeriodModeLabel = () => {
    if (depletionPeriodMode === 'mtd') return 'MTD';
    return 'YTD';
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
    if (section3Data?.asof_date) {
      const startDate = getPeriodStartForMode();
      const endDate = section3Data.asof_date;
      if (!startDate) return '';
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
  const getInventorySalesBasisInfo = () => {
    if (!section3Data?.asof_date) return '';
    const endDate = String(section3Data.asof_date);
    const startDate = getPeriodStartForMode();
    return language === 'ko'
      ? `소진액 기준(${getPeriodModeLabel()}): ${startDate}~${endDate}`
      : `Depleted sales basis (${getPeriodModeLabel()}): ${startDate}~${endDate}`;
  };

  const getTargetModeLabel = () => {
    if (depletionPeriodMode === 'ytd') {
      if (language === 'ko') return '누적목표';
      return isCompactEnglish ? 'YTD' : 'YTD Target';
    }
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
  const getActivePastSeasonInventoryCard = () => {
    const activePastSeasonKey = String(section3Data?.season_type || '').toUpperCase().includes('SS') ? 'past_s' : 'past_f';
    return Array.isArray(section3Data?.inventory_segment_cards)
      ? section3Data.inventory_segment_cards.find((card: any) => card?.key === activePastSeasonKey)
      : null;
  };
  const getFallbackStagnantByYear = () => {
    const card = getActivePastSeasonInventoryCard();
    const breakdown = Array.isArray(card?.breakdown) ? card.breakdown : [];
    const result: Record<'y1' | 'y2' | 'y3_plus' | 'total', number> = {
      y1: 0,
      y2: 0,
      y3_plus: 0,
      total: 0,
    };

    breakdown.forEach((item: any) => {
      const labelKey = String(item?.label_key || '') as 'y1' | 'y2' | 'y3_plus';
      if (labelKey !== 'y1' && labelKey !== 'y2' && labelKey !== 'y3_plus') return;
      const nodes = Array.isArray(item?.category_nodes) ? item.category_nodes : [];
      const stagnantAmt = nodes.reduce((sum: number, node: any) => {
        const stockAmt = Number(node?.curr_stock_amt || 0);
        const monthSales = Number(node?.current_month_tag_sales || 0);
        if (stockAmt <= 0) return sum;
        return monthSales <= 0 || monthSales < stockAmt * 0.001 ? sum + stockAmt : sum;
      }, 0);
      result[labelKey] = stagnantAmt;
      result.total += stagnantAmt;
    });

    return result;
  };

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
    const fallbackPastSeasonCard = getActivePastSeasonInventoryCard();
    const currentStock = header.curr_stock_amt || Number(fallbackPastSeasonCard?.curr_stock_amt || 0);
    const currentStockYoyPct =
      (header.curr_stock_yoy_pct as number | null | undefined) ??
      (typeof fallbackPastSeasonCard?.yoy_pct === 'number' ? fallbackPastSeasonCard.yoy_pct : null);
    const inventoryDays = header.inv_days as number | null | undefined;
    const fallbackStagnantByYear = getFallbackStagnantByYear();
    const isStagnantFallback = !Number(header.stagnant_stock_amt || 0) && fallbackStagnantByYear.total > 0;
    const stagnantStock = header.stagnant_stock_amt || fallbackStagnantByYear.total || 0;
    const stagnantRatio = currentStock > 0 ? (stagnantStock / currentStock) * 100 : 0;
    const prevMonthStagnantRatio =
      isStagnantFallback && !Number(header.prev_month_stagnant_ratio || 0)
        ? null
        : (header.prev_month_stagnant_ratio || 0) * 100;
    const stagnantRatioChange = prevMonthStagnantRatio !== null ? stagnantRatio - prevMonthStagnantRatio : null;

    const cumulativeTagSales = header.period_tag_sales || 0;
    const cumulativeActSales = header.period_act_sales || 0;
    const currentMonthTagSales = header.current_month_depleted || 0;
    const currentMonthActSales = header.current_month_depleted_act || 0;
    const currentMonthTagSalesLy = header.current_month_depleted_ly as number | null | undefined;
    const currentMonthActSalesLy = header.current_month_depleted_act_ly as number | null | undefined;
    const ytdTagSales = header.ytd_tag_sales ?? cumulativeTagSales;
    const ytdActSales = header.ytd_act_sales ?? cumulativeActSales;
    const selectedTagSales = depletionPeriodMode === 'mtd' ? currentMonthTagSales : ytdTagSales;
    const selectedActSales = depletionPeriodMode === 'mtd' ? currentMonthActSales : ytdActSales;
    const selectedSalesLy = depletionPeriodMode === 'mtd'
      ? currentMonthTagSalesLy
      : ((header.ytd_tag_sales_ly ?? header.period_tag_sales_ly) as number | null | undefined);
    const selectedActLy = depletionPeriodMode === 'mtd'
      ? currentMonthActSalesLy
      : ((header.ytd_act_sales_ly ?? header.period_act_sales_ly) as number | null | undefined);
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
    const selectedDiscountRate = depletionPeriodMode === 'mtd' ? currentMonthDiscountRate : cumulativeDiscountRate;
    const selectedDiscountRateLy =
      depletionPeriodMode === 'mtd'
        ? null
        : (selectedSalesLy !== null &&
            selectedSalesLy !== undefined &&
            selectedSalesLy > 0 &&
            selectedActLy !== null &&
            selectedActLy !== undefined &&
            Number.isFinite(selectedActLy)
              ? (1 - selectedActLy / selectedSalesLy) * 100
              : cumulativeDiscountRateLy);
    const selectedDiscountRateDiffPct =
      depletionPeriodMode === 'mtd' &&
      header.current_month_discount_rate_diff_pct !== null &&
      header.current_month_discount_rate_diff_pct !== undefined
        ? Number(header.current_month_discount_rate_diff_pct)
        : selectedDiscountRate !== null && selectedDiscountRateLy !== null
          ? selectedDiscountRate - selectedDiscountRateLy
          : null;
    const selectedYoyBase =
      selectedSalesLy !== null && selectedSalesLy !== undefined && selectedSalesLy > 0
        ? selectedSalesLy
        : selectedActLy !== null && selectedActLy !== undefined && selectedActLy > 0
          ? selectedActLy
          : null;
    const selectedYoyCurrent =
      selectedSalesLy !== null && selectedSalesLy !== undefined && selectedSalesLy > 0
        ? selectedTagSales
        : selectedActSales;
    const selectedSalesYoyPct = selectedYoyBase !== null ? (selectedYoyCurrent / selectedYoyBase) * 100 : null;

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
        value: formatCurrency(selectedTagSales),
        badge:
          selectedTagSales > 0
            ? hasTargetInfo && monthlyTargetGross && depletionPeriodMode === 'mtd'
              ? `${language === 'ko' ? '당월' : 'MTD'} ${formatCurrency(selectedTagSales)} / ${language === 'ko' ? '월목표' : 'Tgt'} ${formatCurrency(monthlyTargetGross)}`
              : `${getPeriodModeLabel()} ${formatCurrency(selectedTagSales)}`
            : null,
        badgeClass: 'text-orange-700 bg-orange-50',
        meta: [
          `${t(language, 'yoy')} ${formatPercent(selectedSalesYoyPct, 0)}`,
          <span key="k2-discount" className="inline-flex min-h-[14px] flex-wrap items-baseline gap-x-1">
            <span>
              {t(language, 'discountRate')}{' '}
              <span className="font-semibold italic text-sky-700">{formatPercent(selectedDiscountRate, 1)}</span>
            </span>
            {selectedDiscountRateDiffPct !== null ? (
              <span
                className={`font-semibold ${
                  selectedDiscountRateDiffPct > 0
                    ? 'text-rose-600'
                    : selectedDiscountRateDiffPct < 0
                      ? 'text-emerald-600'
                      : 'text-gray-500'
                }`}
              >
                {language === 'ko' ? '전년비 ' : 'vs LY '}
                {formatSignedPercentPoint(selectedDiscountRateDiffPct)}
              </span>
            ) : null}
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
            badge: stagnantRatioChange !== null && stagnantRatioChange !== 0 ? formatSignedPercentPoint(stagnantRatioChange) : null,
            badgeClass: stagnantRatioChange !== null ? metricTone(stagnantRatioChange, 0) : 'text-gray-500 bg-gray-100',
            meta: [
              `${t(language, 'vsLastMonthEnd')} ${stagnantRatioChange !== null ? formatSignedPercentPoint(stagnantRatioChange) : '-'}`,
            ],
          },
      hasTargetInfo,
    };
  };

  const kpis = calculateKPIs();
  const headerFallbackStagnantByYear = getFallbackStagnantByYear();
  const stagnantRatioRisk =
    section3Data?.header?.curr_stock_amt > 0
      ? ((section3Data.header.stagnant_stock_amt || headerFallbackStagnantByYear.total || 0) / section3Data.header.curr_stock_amt) * 100
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
  const detailTotalCard = summaryCards?.detail_total || null;
  const yearCards = summaryCards?.year_cards || [];
  const rawDetailSeasonType = String(section3Data?.detail_season_type || '').toUpperCase();
  const asofSeasonType = getMainSeasonTypeFromAsof();
  const detailSeasonType = rawDetailSeasonType === 'S' || rawDetailSeasonType === 'F'
    ? rawDetailSeasonType
    : asofSeasonType;
  const detailSeasonLabel = (() => {
    const asofDate = String(section3Data?.asof_date || '');
    const yearText = asofDate.length >= 4 ? asofDate.slice(2, 4) : '';
    if (!yearText || (detailSeasonType !== 'S' && detailSeasonType !== 'F')) return '';
    return `${yearText}${detailSeasonType}`;
  })();
  const mainPastSeasonLabel = detailSeasonType === 'S'
    ? (language === 'ko' ? '과시즌S' : 'Old S')
    : detailSeasonType === 'F'
      ? (language === 'ko' ? '과시즌F' : 'Old F')
      : '';
  const fallbackInventorySegmentCards = Array.isArray(section3Data?.inventory_segment_cards)
    ? section3Data.inventory_segment_cards
    : [];
  const activePastSeasonKey = detailSeasonType === 'S' ? 'past_s' : 'past_f';
  const activePastSeasonInventoryCard = fallbackInventorySegmentCards.find(
    (card: any) => card?.key === activePastSeasonKey
  );
  const activePastSeasonBreakdown = Array.isArray(activePastSeasonInventoryCard?.breakdown)
    ? activePastSeasonInventoryCard.breakdown
    : [];
  const fallbackStagnantByYear = getFallbackStagnantByYear();
  const getFallbackYearCard = (rank: number) => {
    const labelKey = rank === 1 ? 'y1' : rank === 2 ? 'y2' : 'y3_plus';
    const breakdown = activePastSeasonBreakdown.find((item: any) => item?.label_key === labelKey);
    if (!breakdown) return null;
    const yearBucket = rank === 1 ? '1년차' : rank === 2 ? '2년차' : '3년차 이상';
    const heatmapCell = Array.isArray(section3Data?.target_heatmap?.rows)
      ? section3Data.target_heatmap.rows
          .find((row: any) => String(row?.year_bucket || '') === yearBucket)
          ?.cells?.find((cell: any) => cell?.category_key === 'all')
      : null;
    const heatmapTargetInfo = heatmapCell
      ? {
          progress_pct: heatmapCell.progress_pct ?? null,
          projected_progress_pct: heatmapCell.projected_progress_pct ?? null,
          actual_discount_rate: heatmapCell.actual_discount_rate ?? null,
          target_discount_rate: heatmapCell.target_discount_rate ?? null,
        }
      : null;
    const fallbackSalesAmt = Number(
      heatmapCell?.actual_sold_amt ??
      breakdown.current_month_tag_sales ??
      breakdown.period_tag_sales ??
      0
    );
    return {
      year_bucket: yearBucket,
      season_code: '',
      curr_stock_amt: Number(breakdown.curr_stock_amt || 0),
      stagnant_stock_amt: fallbackStagnantByYear[labelKey],
      period_tag_sales: Number(breakdown.period_tag_sales || 0),
      current_month_depleted: fallbackSalesAmt,
      sales_yoy_pct: breakdown.period_sales_yoy_pct ?? null,
      discount_rate: heatmapCell?.actual_discount_rate ?? breakdown.discount_rate ?? null,
      target_info: heatmapTargetInfo
        ? {
            monthly: heatmapTargetInfo,
            cumulative: null,
          }
        : null,
      completed: Number(breakdown.curr_stock_amt || 0) <= 0,
      category_nodes: breakdown.category_nodes || [],
    };
  };
  const normalizedYearCards = (() => {
    const cards = [...yearCards];
    cards.forEach((card: any) => {
      const rank = getYearBucketRank(card?.year_bucket);
      if (rank === null) return;
      const fallback = getFallbackYearCard(rank);
      if (!fallback) return;
      if (Number(card.curr_stock_amt || 0) <= 0) {
        card.curr_stock_amt = fallback.curr_stock_amt;
      }
      if (Number(card.period_tag_sales || 0) <= 0) {
        card.period_tag_sales = fallback.period_tag_sales;
      }
      if (Number(card.current_month_depleted || 0) <= 0) {
        card.current_month_depleted = fallback.current_month_depleted;
      }
      if (!card.target_info && fallback.target_info) {
        card.target_info = fallback.target_info;
      } else if (!card.target_info?.monthly && fallback.target_info?.monthly) {
        card.target_info = {
          ...(card.target_info || {}),
          monthly: fallback.target_info.monthly,
        };
      }
      if (!card.category_nodes && fallback.category_nodes) {
        card.category_nodes = fallback.category_nodes;
      }
    });

    [1, 2, 3].forEach((rank) => {
      const hasRankCard = cards.some((card: any) => getYearBucketRank(card?.year_bucket) === rank);
      if (hasRankCard) return;
      const fallback = getFallbackYearCard(rank);
      if (fallback && (fallback.curr_stock_amt > 0 || fallback.period_tag_sales > 0 || rank === 3)) {
        cards.push(fallback);
        return;
      }
      if (region === 'TW' && rank === 3) {
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
    });
    return cards;
  })();
  const fallbackDetailStockAmt = Number(activePastSeasonInventoryCard?.curr_stock_amt || 0);
  const detailTotalStockAmt = Number(detailTotalCard?.curr_stock_amt || 0) || fallbackDetailStockAmt;
  const effectiveStagnantStockAmt =
    Number(summaryCards?.stagnant_card?.stagnant_stock_amt || 0) || fallbackStagnantByYear.total;
  const effectiveStagnantRatio =
    Number(summaryCards?.stagnant_card?.stagnant_ratio || 0) ||
    (detailTotalStockAmt > 0 ? effectiveStagnantStockAmt / detailTotalStockAmt : 0);
  const isUsingStagnantFallback =
    !Number(summaryCards?.stagnant_card?.stagnant_stock_amt || 0) && fallbackStagnantByYear.total > 0;
  const rawPrevMonthStagnantRatio = summaryCards?.stagnant_card?.prev_month_stagnant_ratio;
  const effectivePrevMonthStagnantRatio =
    isUsingStagnantFallback && !Number(rawPrevMonthStagnantRatio || 0)
      ? null
      : Number(rawPrevMonthStagnantRatio || 0);
  const salesPushWindow = (() => {
    if (!section3Data?.asof_date) {
      return {
        start: '',
        end: '',
      };
    }
    const start = new Date(`${String(section3Data.asof_date)}T00:00:00`);
    start.setFullYear(start.getFullYear() - 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 29);
    const toDateString = (value: Date) => value.toISOString().slice(0, 10);
    return {
      start: toDateString(start),
      end: toDateString(end),
    };
  })();
  const salesPushData = salesPushDetailData || section3Data;
  const salesPushInventoryFallbackRows = (() => {
    if (Array.isArray(salesPushData?.skus) && salesPushData.skus.length > 0) return [];
    const activePastKey = String(salesPushData?.season_type || '').toUpperCase().includes('SS') ? 'past_s' : 'past_f';
    const activePastCard = Array.isArray(salesPushData?.inventory_segment_cards)
      ? salesPushData.inventory_segment_cards.find((card: any) => card?.key === activePastKey)
      : null;
    const yearBucketLabel: Record<string, string> = {
      y1: '1년차',
      y2: '2년차',
      y3_plus: '3년차 이상',
    };
    const rows: any[] = [];
    (Array.isArray(activePastCard?.breakdown) ? activePastCard.breakdown : []).forEach((bucket: any) => {
      const yearBucket = yearBucketLabel[String(bucket?.label_key || '')];
      if (!yearBucket) return;
      (Array.isArray(bucket?.category_nodes) ? bucket.category_nodes : []).forEach((node: any) => {
        const stockAmt = Number(node?.curr_stock_amt || 0);
        const currentMonthSales = Number(node?.current_month_tag_sales || 0);
        const lyPushSales = Number(node?.ly_current_month_tag_sales || node?.ly_period_tag_sales || 0);
        const stagnant = stockAmt > 0 && (currentMonthSales <= 0 || currentMonthSales < stockAmt * 0.001);
        const qualifies = stagnant && lyPushSales >= stockAmt * 0.05;
        rows.push({
          year_bucket: yearBucket,
          cat2: String(node?.cat2 || ''),
          prdt_cd: String(node?.cat2 || ''),
          sales_push_stagnant_amt: qualifies ? stockAmt : 0,
          sales_push_stagnant_qty: qualifies ? 10 : 0,
          is_synthetic_category: true,
          curr_stock_amt: stockAmt,
          curr_stock_qty: 0,
          ly_push_30d_tag_sales: lyPushSales,
          ly_push_30d_sales_qty: 0,
          sales_push_flag: qualifies,
        });
      });
    });
    return rows;
  })();
  const salesPushRawRows =
    Array.isArray(salesPushData?.skus) && salesPushData.skus.length > 0
      ? salesPushData.skus
      : salesPushInventoryFallbackRows;
  const hasSalesPushSkuDetail = salesPushRawRows.length > 0;
  const salesPushBaseSkuRows = salesPushRawRows
    .filter((row: any) => !!row?.sales_push_flag && Number(row?.sales_push_stagnant_amt || 0) > 0)
    .map((row: any) => {
      const currentStockAmt = Number(row?.curr_stock_amt || 0);
      const salesAmt = Number(row?.ly_push_30d_tag_sales || 0);
      return {
        year_bucket: String(row?.year_bucket || ''),
        cat2: String(row?.cat2 || ''),
        prdt_cd: String(row?.prdt_cd || ''),
        sales_push_stagnant_amt: Number(row?.sales_push_stagnant_amt || 0),
        sales_push_stagnant_qty: Number(row?.sales_push_stagnant_qty || 0),
        is_synthetic_category: !!row?.is_synthetic_category,
        current_stock_amt: currentStockAmt,
        current_stock_qty: Number(row?.curr_stock_qty || 0),
        ly_push_30d_tag_sales: salesAmt,
        ly_push_30d_sales_qty: Number(row?.ly_push_30d_sales_qty || 0),
        sales_rate_pct: currentStockAmt > 0 ? (salesAmt / currentStockAmt) * 100 : null,
      };
    });
  const salesPushSkuRows = excludeUnder10Pcs
    ? salesPushBaseSkuRows.filter((row: any) => row?.is_synthetic_category || Number(row?.sales_push_stagnant_qty || 0) >= 10)
    : salesPushBaseSkuRows;
  const summarySalesPush = salesPushData?.summary_cards?.sales_push_summary || null;
  const salesPushSummary = (() => {
    if (salesPushSkuRows.length === 0 && summarySalesPush) {
      return {
        totalAmt: Number(summarySalesPush.total_amt || 0),
        totalSkuCount: Number(summarySalesPush.total_sku_count || 0),
        totalLySales: Number(summarySalesPush.total_ly_sales || 0),
        totalLySalesQty: Number(summarySalesPush.total_ly_sales_qty || 0),
        totalCurrentStockAmt: Number(summarySalesPush.total_current_stock_amt || 0),
        totalCurrentStockQty: Number(summarySalesPush.total_current_stock_qty || 0),
        totalStagnantQty: Number(summarySalesPush.total_stagnant_qty || 0),
        shareOfStagnantPct:
          summarySalesPush.share_of_stagnant_pct !== null && summarySalesPush.share_of_stagnant_pct !== undefined
            ? Number(summarySalesPush.share_of_stagnant_pct)
            : null,
        totalSalesRatePct:
          summarySalesPush.total_sales_rate_pct !== null && summarySalesPush.total_sales_rate_pct !== undefined
            ? Number(summarySalesPush.total_sales_rate_pct)
            : null,
      };
    }
    const totalAmt = salesPushSkuRows.reduce((sum: number, row: any) => sum + row.sales_push_stagnant_amt, 0);
    const totalSkuCount = salesPushSkuRows.length;
    const totalLySales = salesPushSkuRows.reduce((sum: number, row: any) => sum + row.ly_push_30d_tag_sales, 0);
    const totalLySalesQty = salesPushSkuRows.reduce((sum: number, row: any) => sum + row.ly_push_30d_sales_qty, 0);
    const totalCurrentStockAmt = salesPushSkuRows.reduce((sum: number, row: any) => sum + row.current_stock_amt, 0);
    const totalCurrentStockQty = salesPushSkuRows.reduce((sum: number, row: any) => sum + row.current_stock_qty, 0);
    const totalStagnantQty = salesPushSkuRows.reduce((sum: number, row: any) => sum + row.sales_push_stagnant_qty, 0);
    const stagnantTotal = Number(salesPushData?.header?.stagnant_stock_amt || 0);
    return {
      totalAmt,
      totalSkuCount,
      totalLySales,
      totalLySalesQty,
      totalCurrentStockAmt,
      totalCurrentStockQty,
      totalStagnantQty,
      shareOfStagnantPct: stagnantTotal > 0 ? (totalAmt / stagnantTotal) * 100 : null,
      totalSalesRatePct: totalCurrentStockAmt > 0 ? (totalLySales / totalCurrentStockAmt) * 100 : null,
    };
  })();
  const canOpenSalesPushDetail = !simpleDetail && effectiveStagnantStockAmt > 0;
  const salesPushYearRows = ['1년차', '2년차', '3년차 이상']
    .map((bucket) => {
      const rows = salesPushSkuRows.filter((row: any) => row.year_bucket === bucket);
      const totalAmt = rows.reduce((sum: number, row: any) => sum + row.sales_push_stagnant_amt, 0);
      const totalLySales = rows.reduce((sum: number, row: any) => sum + row.ly_push_30d_tag_sales, 0);
      const totalLySalesQty = rows.reduce((sum: number, row: any) => sum + row.ly_push_30d_sales_qty, 0);
      const totalCurrentStockAmt = rows.reduce((sum: number, row: any) => sum + row.current_stock_amt, 0);
      return {
        year_bucket: bucket,
        amount: totalAmt,
        sku_count: rows.length,
        ly_sales: totalLySales,
        ly_sales_qty: totalLySalesQty,
        current_stock_amt: totalCurrentStockAmt,
        share_pct: salesPushSummary.totalAmt > 0 ? (totalAmt / salesPushSummary.totalAmt) * 100 : null,
        sales_rate_pct: totalCurrentStockAmt > 0 ? (totalLySales / totalCurrentStockAmt) * 100 : null,
      };
    })
    .filter((row) => row.amount > 0);
  const salesPushCategoryRows = (selectedSalesPushYear
    ? salesPushSkuRows.filter((row: any) => row.year_bucket === selectedSalesPushYear)
    : []
  ).reduce((acc: any[], row: any) => {
    const existing = acc.find((item) => item.cat2 === row.cat2);
    if (existing) {
      existing.amount += row.sales_push_stagnant_amt;
      existing.sku_count += 1;
      existing.ly_sales += row.ly_push_30d_tag_sales;
      existing.ly_sales_qty += row.ly_push_30d_sales_qty;
      existing.current_stock_amt += row.current_stock_amt;
      existing.stagnant_qty += row.sales_push_stagnant_qty;
      return acc;
    }
    acc.push({
      cat2: row.cat2,
      amount: row.sales_push_stagnant_amt,
      sku_count: 1,
      ly_sales: row.ly_push_30d_tag_sales,
      ly_sales_qty: row.ly_push_30d_sales_qty,
      current_stock_amt: row.current_stock_amt,
      stagnant_qty: row.sales_push_stagnant_qty,
    });
    return acc;
  }, []).map((row: any) => ({
    ...row,
    share_pct: selectedSalesPushYear
      ? (() => {
          const yearTotal = salesPushSkuRows
            .filter((item: any) => item.year_bucket === selectedSalesPushYear)
            .reduce((sum: number, item: any) => sum + item.sales_push_stagnant_amt, 0);
          return yearTotal > 0 ? (row.amount / yearTotal) * 100 : null;
        })()
      : null,
    sales_rate_pct: row.current_stock_amt > 0 ? (row.ly_sales / row.current_stock_amt) * 100 : null,
  })).sort((a: any, b: any) => b.amount - a.amount || a.cat2.localeCompare(b.cat2));
  const salesPushSkuDetailRows = (selectedSalesPushYear && selectedSalesPushCategory)
    ? salesPushSkuRows
        .filter((row: any) => row.year_bucket === selectedSalesPushYear && row.cat2 === selectedSalesPushCategory)
        .sort((a: any, b: any) => b.sales_push_stagnant_amt - a.sales_push_stagnant_amt || a.prdt_cd.localeCompare(b.prdt_cd))
    : [];
  const bottomCards = summaryCards
    ? [
        {
          key: 'all',
          title: language === 'ko' ? '전체' : 'Total',
          seasonCode: '',
          stockAmt: detailTotalStockAmt,
          salesAmt: targetMode === 'monthly'
            ? Number(section3Data?.header?.current_month_depleted || 0)
            : Number(section3Data?.header?.ytd_tag_sales ?? detailTotalCard?.ytd_tag_sales ?? detailTotalCard?.period_tag_sales ?? 0),
          salesYoyPct: detailTotalCard?.sales_yoy_pct ?? null,
          targetInfo: detailTotalCard?.target_info?.[targetMode] || null,
          discountRate: detailTotalCard?.discount_rate ?? null,
        },
        ...normalizedYearCards.map((card: any) => ({
          key: card.year_bucket,
          title: getYearBucketLabel(card.year_bucket),
          seasonCode: getYearBucketRank(card.year_bucket) === 3 ? '' : card.season_code,
          stockAmt: card.curr_stock_amt,
          stagnantStockAmt: card.stagnant_stock_amt,
          salesAmt: targetMode === 'monthly'
            ? Number(card.current_month_depleted ?? card.period_tag_sales ?? 0)
            : Number(card.ytd_tag_sales ?? card.period_tag_sales ?? 0),
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
              stockAmt: effectiveStagnantStockAmt,
              salesAmt: null,
              salesYoyPct: null,
              targetInfo: null,
              discountRate: null,
              stagnantRatio: effectiveStagnantRatio,
              prevMonthStagnantRatio: effectivePrevMonthStagnantRatio,
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
  const oldSeasonCards = useMemo<Array<{
    key: 'past_s' | 'past_f';
    label: string;
    stockAmt: number;
    stockYoyPct: number | null;
    salesAmt: number;
    salesYoyPct: number | null;
    discountRate: number | null;
    discountRateDiffPct: number | null;
  }>>(() => {
    const activeType = detailSeasonType === 'S' || detailSeasonType === 'F'
      ? detailSeasonType
      : String(section3Data?.season_type || '').toUpperCase().includes('SS')
        ? 'S'
        : 'F';
    const summarizeOldSeasonCard = (key: 'past_s' | 'past_f') => {
      const card = orderedInventorySegmentCards.find((item) => item.key === key);
      if (!card) return null;
      const nodes = (card.breakdown || []).flatMap((item) => item.category_nodes || []);
      const selectedTagSales = (item: any) =>
        depletionPeriodMode === 'mtd'
          ? Number(item.current_month_tag_sales ?? item.period_tag_sales ?? 0)
          : Number(item.ytd_tag_sales ?? item.period_tag_sales ?? 0);
      const selectedLyTagSales = (item: any) =>
        depletionPeriodMode === 'mtd'
          ? Number(item.ly_current_month_tag_sales ?? item.ly_period_tag_sales ?? 0)
          : Number(item.ly_ytd_tag_sales ?? item.ly_period_tag_sales ?? 0);
      const selectedDiscountRate = (item: any) =>
        depletionPeriodMode === 'mtd'
          ? item.current_month_discount_rate ?? item.discount_rate
          : item.ytd_discount_rate ?? item.discount_rate;
      const selectedDiscountRateDiff = (item: any) =>
        depletionPeriodMode === 'mtd'
          ? item.current_month_discount_rate_diff_pct ?? item.discount_rate_diff_pct
          : item.ytd_discount_rate_diff_pct ?? item.discount_rate_diff_pct;
      const salesAmt = nodes.reduce((sum, item) => sum + selectedTagSales(item), 0);
      const lySales = nodes.reduce((sum, item) => sum + selectedLyTagSales(item), 0);
      const weightedActSales = nodes.reduce((sum, item) => {
        const tagSales = selectedTagSales(item);
        const discountRate = Number(selectedDiscountRate(item) ?? 0);
        return sum + tagSales * (1 - discountRate / 100);
      }, 0);
      const weightedLyActSales = nodes.reduce((sum, item) => {
        const lyTagSales = selectedLyTagSales(item);
        const discountRate = selectedDiscountRate(item);
        const discountRateDiff = selectedDiscountRateDiff(item);
        if (discountRate === null || discountRate === undefined || discountRateDiff === null || discountRateDiff === undefined) {
          return sum;
        }
        return sum + lyTagSales * (1 - (Number(discountRate) - Number(discountRateDiff)) / 100);
      }, 0);
      const discountRate = salesAmt > 0 ? (1 - weightedActSales / salesAmt) * 100 : null;
      const lyDiscountRate = lySales > 0 ? (1 - weightedLyActSales / lySales) * 100 : null;
      return {
        key,
        label: language === 'ko'
          ? (key === 'past_s' ? '과시즌S' : '과시즌F')
          : (key === 'past_s' ? 'Old S' : 'Old F'),
        stockAmt: Number(card.curr_stock_amt || 0),
        stockYoyPct: typeof card.yoy_pct === 'number' ? card.yoy_pct : null,
        salesAmt,
        salesYoyPct: lySales > 0 ? (salesAmt / lySales) * 100 : null,
        discountRate,
        discountRateDiffPct:
          discountRate !== null && lyDiscountRate !== null ? discountRate - lyDiscountRate : null,
      };
    };
    const supplementalKeys: Array<'past_s' | 'past_f'> = activeType === 'S' ? ['past_f'] : ['past_s'];
    return supplementalKeys
      .map((key) => summarizeOldSeasonCard(key))
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [depletionPeriodMode, detailSeasonType, language, orderedInventorySegmentCards, section3Data?.season_type]);
  const oldSeasonTotalCard = useMemo(() => {
    const cards = orderedInventorySegmentCards.filter((item) => item.key === 'past_s' || item.key === 'past_f');
    if (cards.length === 0) return null;
    const stockAmt = cards.reduce((sum, item) => sum + Number(item.curr_stock_amt || 0), 0);
    const lyStockAmt = cards.reduce((sum, item) => sum + Number(item.ly_curr_stock_amt || 0), 0);
    if (stockAmt <= 0 && lyStockAmt <= 0) return null;
    return {
      label: language === 'ko' ? '과시즌재고합계' : 'Old Season Total',
      stockAmt,
      stockYoyPct: lyStockAmt > 0 ? (stockAmt / lyStockAmt) * 100 : null,
    };
  }, [language, orderedInventorySegmentCards]);
  const getInventoryYoyTone = (yoy: number | null | undefined) => {
    if (yoy === null || yoy === undefined || !Number.isFinite(yoy)) return 'text-gray-500';
    if (yoy > 100) return 'text-rose-600';
    if (yoy < 100) return 'text-emerald-600';
    return 'text-gray-600';
  };
  const getInventoryDiffTone = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'text-gray-400';
    if (value > 0) return 'text-rose-600';
    if (value < 0) return 'text-emerald-600';
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
  const aggregateCategoryNodes = (
    groups: Array<
      Array<{
        cat2: string;
        curr_stock_amt: number;
        ly_curr_stock_amt?: number | null;
        yoy_pct?: number | null;
        stock_share_pct?: number | null;
        stock_share_diff_pct?: number | null;
        period_tag_sales?: number;
        ly_period_tag_sales?: number | null;
        period_sales_yoy_pct?: number | null;
        discount_rate?: number | null;
        discount_rate_diff_pct?: number | null;
      }> | undefined
    >
  ) => {
    const totals = new Map<
      string,
      {
        cat2: string;
        curr_stock_amt: number;
        ly_curr_stock_amt: number;
        period_tag_sales: number;
        ly_period_tag_sales: number;
        weighted_act_sales: number;
        weighted_ly_act_sales: number;
      }
    >();
    groups.forEach((nodes) => {
      (nodes || []).forEach((node) => {
        const key = String(node.cat2 || '').trim().toUpperCase();
        if (!key) return;
        const existing = totals.get(key) || {
          cat2: key,
          curr_stock_amt: 0,
          ly_curr_stock_amt: 0,
          period_tag_sales: 0,
          ly_period_tag_sales: 0,
          weighted_act_sales: 0,
          weighted_ly_act_sales: 0,
        };
        const periodTagSales = Number(node.period_tag_sales || 0);
        const lyPeriodTagSales = Number(node.ly_period_tag_sales || 0);
        const discountRate = Number(node.discount_rate || 0);
        const discountRateDiffPct = Number(node.discount_rate_diff_pct || 0);
        const lyDiscountRate = discountRate - discountRateDiffPct;
        existing.curr_stock_amt += Number(node.curr_stock_amt || 0);
        existing.ly_curr_stock_amt += Number(node.ly_curr_stock_amt || 0);
        existing.period_tag_sales += periodTagSales;
        existing.ly_period_tag_sales += lyPeriodTagSales;
        existing.weighted_act_sales += periodTagSales * (1 - discountRate / 100);
        existing.weighted_ly_act_sales += lyPeriodTagSales * (1 - lyDiscountRate / 100);
        totals.set(key, existing);
      });
    });

    const totalCurrStock = [...totals.values()].reduce((sum, item) => sum + item.curr_stock_amt, 0);
    const totalLyStock = [...totals.values()].reduce((sum, item) => sum + item.ly_curr_stock_amt, 0);

    return [...totals.values()]
      .map((item) => {
        const discountRate =
          item.period_tag_sales > 0 ? (1 - item.weighted_act_sales / item.period_tag_sales) * 100 : null;
        const lyDiscountRate =
          item.ly_period_tag_sales > 0 ? (1 - item.weighted_ly_act_sales / item.ly_period_tag_sales) * 100 : null;
        const stockSharePct = totalCurrStock > 0 ? (item.curr_stock_amt / totalCurrStock) * 100 : null;
        const lyStockSharePct = totalLyStock > 0 ? (item.ly_curr_stock_amt / totalLyStock) * 100 : null;

        return {
          cat2: item.cat2,
          curr_stock_amt: item.curr_stock_amt,
          ly_curr_stock_amt: item.ly_curr_stock_amt > 0 ? item.ly_curr_stock_amt : null,
          yoy_pct: item.ly_curr_stock_amt > 0 ? (item.curr_stock_amt / item.ly_curr_stock_amt) * 100 : null,
          stock_share_pct: stockSharePct,
          stock_share_diff_pct:
            stockSharePct !== null && lyStockSharePct !== null ? stockSharePct - lyStockSharePct : null,
          period_tag_sales: item.period_tag_sales > 0 ? item.period_tag_sales : 0,
          ly_period_tag_sales: item.ly_period_tag_sales > 0 ? item.ly_period_tag_sales : null,
          period_sales_yoy_pct: item.ly_period_tag_sales > 0 ? (item.period_tag_sales / item.ly_period_tag_sales) * 100 : null,
          discount_rate: discountRate,
          discount_rate_diff_pct:
            discountRate !== null && lyDiscountRate !== null ? discountRate - lyDiscountRate : null,
        };
      })
      .sort((a, b) => (b.curr_stock_amt - a.curr_stock_amt) || a.cat2.localeCompare(b.cat2));
  };
  const buildStagnantCategoryNodes = (yearBucket: string) => {
    const categoryRows = Array.isArray(section3Data?.categories) ? section3Data.categories : [];
    return categoryRows
      .filter((row: any) => String(row?.year_bucket || '') === yearBucket && Number(row?.stagnant_stock_amt || 0) > 0)
      .map((row: any) => {
        const currentStockAmt = Number(row?.curr_stock_amt || 0);
        const stagnantStockAmt = Number(row?.stagnant_stock_amt || 0);
        return {
          cat2: String(row?.cat2 || '-'),
          year_bucket: String(row?.year_bucket || ''),
          curr_stock_amt: stagnantStockAmt,
          current_stock_amt: currentStockAmt,
          stagnant_stock_amt: stagnantStockAmt,
          stagnant_stock_qty: Number(row?.stagnant_stock_qty || 0),
          stagnant_ratio_pct: currentStockAmt > 0 ? (stagnantStockAmt / currentStockAmt) * 100 : null,
        };
      })
      .sort((a: any, b: any) => (b.curr_stock_amt - a.curr_stock_amt) || a.cat2.localeCompare(b.cat2));
  };
  const buildInventoryDetailCardMap = () => {
    const map = new Map<string, InventorySegmentCard>();
    const inventoryCardMap = new Map(orderedInventorySegmentCards.map((card) => [card.key, card]));
    const pastS = inventoryCardMap.get('past_s');
    const pastF = inventoryCardMap.get('past_f');
    const activeSeasonType = String(section3Data?.season_type || '').toUpperCase().includes('SS') ? 'S' : 'F';
    const findBreakdown = (card: InventorySegmentCard | undefined, labelKey: string) =>
      card?.breakdown?.find((item) => item.label_key === labelKey);
    const buildYearBucketDetailCard = (
      rawKey: string,
      labelKey: 'y1' | 'y2' | 'y3_plus',
      fallbackTitle: string,
      _stockAmt: number,
      _salesAmt: number | null,
      _salesYoyPct: number | null
    ): InventorySegmentCard => {
      const sItem = findBreakdown(pastS, labelKey);
      const fItem = findBreakdown(pastF, labelKey);
      const currentSeasonItem = activeSeasonType === 'S' ? sItem : fItem;
      const currentSeasonLabel = activeSeasonType === 'S' ? 'past_s' : 'past_f';
      const curr = Number(_stockAmt || 0);
      const ly =
        currentSeasonItem?.ly_curr_stock_amt && currentSeasonItem.ly_curr_stock_amt > 0
          ? Number(currentSeasonItem.ly_curr_stock_amt)
          : 0;
      const activeCategoryNodes = activeSeasonType === 'S' ? (sItem?.category_nodes || []) : (fItem?.category_nodes || []);
      const salesCurr = Number(_salesAmt || 0);
      const salesLy = activeCategoryNodes.reduce((sum, item) => sum + Number(item.ly_period_tag_sales || 0), 0);
      return {
        key: rawKey,
        label: fallbackTitle,
        curr_stock_amt: curr,
        ly_curr_stock_amt: ly > 0 ? ly : null,
        yoy_pct: ly > 0 ? (curr / ly) * 100 : null,
        sales_amt: salesCurr > 0 ? salesCurr : null,
        sales_yoy_pct: _salesYoyPct ?? (salesLy > 0 ? (salesCurr / salesLy) * 100 : null),
        breakdown: [
          currentSeasonItem
            ? {
                label_key: currentSeasonLabel,
                curr_stock_amt: curr,
                ly_curr_stock_amt: ly > 0 ? ly : null,
                yoy_pct: ly > 0 ? (curr / ly) * 100 : currentSeasonItem.yoy_pct,
                period_tag_sales: salesCurr > 0 ? salesCurr : undefined,
                period_sales_yoy_pct: _salesYoyPct ?? undefined,
                category_nodes: activeCategoryNodes,
              }
            : null,
        ].filter(Boolean) as InventorySegmentCard['breakdown'],
      };
    };

    const totalYearBreakdown = [
      { label_key: 'y1', s: findBreakdown(pastS, 'y1'), f: findBreakdown(pastF, 'y1') },
      { label_key: 'y2', s: findBreakdown(pastS, 'y2'), f: findBreakdown(pastF, 'y2') },
      { label_key: 'y3_plus', s: findBreakdown(pastS, 'y3_plus'), f: findBreakdown(pastF, 'y3_plus') },
    ]
      .map((item) => {
        const currentSeasonItem = activeSeasonType === 'S' ? item.s : item.f;
        const curr = Number(currentSeasonItem?.curr_stock_amt || 0);
        const ly = Number(currentSeasonItem?.ly_curr_stock_amt || 0);
        return {
          label_key: item.label_key,
          curr_stock_amt: curr,
          ly_curr_stock_amt: ly > 0 ? ly : null,
          yoy_pct: ly > 0 ? (curr / ly) * 100 : null,
          category_nodes: currentSeasonItem?.category_nodes || [],
        };
      })
      .filter((item) => item.curr_stock_amt > 0 || (item.ly_curr_stock_amt ?? 0) > 0);

    map.set('all', {
      key: 'all',
      label: language === 'ko' ? '전체' : 'Total',
      curr_stock_amt: detailTotalStockAmt,
      ly_curr_stock_amt: null,
      yoy_pct: null,
      sales_amt: detailTotalCard?.period_tag_sales || 0,
      sales_yoy_pct: detailTotalCard?.sales_yoy_pct ?? null,
      breakdown: totalYearBreakdown,
    });

    normalizedYearCards.forEach((card: any) => {
      const rank = getYearBucketRank(card.year_bucket);
      if (rank === 1) {
        map.set(
          card.year_bucket,
          buildYearBucketDetailCard(card.year_bucket, 'y1', getYearBucketLabel(card.year_bucket), card.curr_stock_amt, card.period_tag_sales, card.sales_yoy_pct)
        );
      } else if (rank === 2) {
        map.set(
          card.year_bucket,
          buildYearBucketDetailCard(card.year_bucket, 'y2', getYearBucketLabel(card.year_bucket), card.curr_stock_amt, card.period_tag_sales, card.sales_yoy_pct)
        );
      } else if (rank === 3) {
        map.set(
          card.year_bucket,
          buildYearBucketDetailCard(card.year_bucket, 'y3_plus', getYearBucketLabel(card.year_bucket), card.curr_stock_amt, card.period_tag_sales, card.sales_yoy_pct)
        );
      }
    });

    if (summaryCards?.stagnant_card) {
      map.set('stagnant', {
        key: 'stagnant',
        label: language === 'ko' ? '정체재고' : 'Stagnant Stock',
        curr_stock_amt: effectiveStagnantStockAmt,
        ly_curr_stock_amt: null,
        yoy_pct: null,
        sales_amt: null,
        sales_yoy_pct: null,
        breakdown: normalizedYearCards.map((yearCard: any) => ({
          label_key: String(yearCard.year_bucket || ''),
          curr_stock_amt: Number(yearCard.stagnant_stock_amt || 0),
          current_stock_amt: Number(yearCard.curr_stock_amt || 0),
          stagnant_stock_qty:
            Number(
              (Array.isArray(section3Data?.years)
                ? section3Data.years.find((row: any) => String(row?.year_bucket || '') === String(yearCard.year_bucket || ''))?.stagnant_stock_qty
                : 0) || 0
            ),
          stagnant_ratio_pct:
            Number(yearCard.curr_stock_amt || 0) > 0
              ? (Number(yearCard.stagnant_stock_amt || 0) / Number(yearCard.curr_stock_amt || 0)) * 100
              : null,
          ly_curr_stock_amt: null,
          yoy_pct: null,
          category_nodes: buildStagnantCategoryNodes(String(yearCard.year_bucket || '')),
        })).filter((row: any) => row.curr_stock_amt > 0),
      });
    }

    orderedInventorySegmentCards.forEach((card) => {
      map.set(card.key, {
        ...card,
        sales_amt: null,
        sales_yoy_pct: null,
      });
    });

    return map;
  };
  const inventoryDetailCardMap = buildInventoryDetailCardMap();
  const isStagnantDetail = selectedInventoryCard?.key === 'stagnant';
  const inventoryBreakdownOrder: Record<string, number> = {
    current: 0,
    y1: 1,
    y2: 2,
    y3_plus: 3,
    current_s: 4,
    current_f: 5,
    current_n: 6,
    past_s: 7,
    past_f: 8,
    past_n: 9,
  };
  const selectedInventoryRows = [...(selectedInventoryCard?.breakdown || [])].sort(
    (a, b) =>
      (inventoryBreakdownOrder[a.label_key] ?? Number.MAX_SAFE_INTEGER) -
        (inventoryBreakdownOrder[b.label_key] ?? Number.MAX_SAFE_INTEGER) ||
      a.label_key.localeCompare(b.label_key)
  );
  const selectedInventoryRowTotal = selectedInventoryRows.reduce((sum, row: any) => sum + Number(row.curr_stock_amt || 0), 0);
  const selectedInventoryRowLyTotal = selectedInventoryRows.reduce((sum, row: any) => sum + Number(row.ly_curr_stock_amt || 0), 0);
  const fallbackInventoryNode =
    selectedInventoryCard
      ? (() => {
          const firstDetailRow = (selectedInventoryCard.breakdown || []).find(
            (row) => Array.isArray(row.category_nodes) && row.category_nodes.length > 0
          );
          return firstDetailRow
            ? {
                name: getInventoryBreakdownLabel(firstDetailRow.label_key),
                categoryNodes: firstDetailRow.category_nodes || [],
              }
            : null;
        })()
      : null;
  const activeInventoryNode = selectedInventoryNode || fallbackInventoryNode;
  const activeInventoryCategoryRows = activeInventoryNode
    ? [...activeInventoryNode.categoryNodes].sort((a, b) => (b.curr_stock_amt - a.curr_stock_amt) || a.cat2.localeCompare(b.cat2))
    : [];
  const activeInventoryCategoryTotal = activeInventoryCategoryRows.reduce((sum, row: any) => sum + Number(row.curr_stock_amt || 0), 0);
  const toggleInventoryCategorySort = (
    key:
      | 'cat2'
      | 'curr_stock_amt'
      | 'yoy_pct'
      | 'share'
      | 'stock_share_diff_pct'
      | 'period_tag_sales'
      | 'period_sales_yoy_pct'
      | 'discount_rate'
      | 'discount_rate_diff_pct'
      | 'stagnant_ratio_pct'
      | 'current_stock_amt'
      | 'stagnant_stock_qty'
  ) => {
    setInventoryCategorySort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'cat2' ? 'asc' : 'desc' }
    );
  };
  const getInventoryCategorySortIndicator = (
    key:
      | 'cat2'
      | 'curr_stock_amt'
      | 'yoy_pct'
      | 'share'
      | 'stock_share_diff_pct'
      | 'period_tag_sales'
      | 'period_sales_yoy_pct'
      | 'discount_rate'
      | 'discount_rate_diff_pct'
      | 'stagnant_ratio_pct'
      | 'current_stock_amt'
      | 'stagnant_stock_qty'
  ) => {
    if (inventoryCategorySort.key !== key) return '';
    return inventoryCategorySort.direction === 'asc' ? ' ▲' : ' ▼';
  };
  const sortedActiveInventoryCategoryRows = [...activeInventoryCategoryRows].sort((a: any, b: any) => {
    const getValue = (row: any) => {
      if (inventoryCategorySort.key === 'cat2') return String(row?.cat2 || '');
      if (inventoryCategorySort.key === 'share') {
        return activeInventoryCategoryTotal > 0 ? (Number(row?.curr_stock_amt || 0) / activeInventoryCategoryTotal) * 100 : -Infinity;
      }
      return row?.[inventoryCategorySort.key] ?? null;
    };

    const left = getValue(a);
    const right = getValue(b);

    if (typeof left === 'string' || typeof right === 'string') {
      const result = String(left || '').localeCompare(String(right || ''));
      return inventoryCategorySort.direction === 'asc' ? result : -result;
    }

    const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
    const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
    if (leftValue === rightValue) {
      return String(a?.cat2 || '').localeCompare(String(b?.cat2 || ''));
    }
    return inventoryCategorySort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  const selectedInventorySkuTotal = selectedInventorySkuNode
    ? selectedInventorySkuNode.rows.reduce((sum, row) => sum + Number(row.curr_stock_amt || 0), 0)
    : 0;
  const toggleSalesPushYearSort = (key: 'year_bucket' | 'amount' | 'share_pct' | 'sku_count' | 'current_stock_amt' | 'ly_sales' | 'ly_sales_qty' | 'sales_rate_pct') => {
    setSalesPushYearSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'year_bucket' ? 'asc' : 'desc' }
    );
  };
  const getSalesPushYearSortIndicator = (key: 'year_bucket' | 'amount' | 'share_pct' | 'sku_count' | 'current_stock_amt' | 'ly_sales' | 'ly_sales_qty' | 'sales_rate_pct') => {
    if (salesPushYearSort.key !== key) return '';
    return salesPushYearSort.direction === 'asc' ? ' ▲' : ' ▼';
  };
  const sortedSalesPushYearRows = [...salesPushYearRows].sort((a: any, b: any) => {
    const left = salesPushYearSort.key === 'year_bucket' ? (getYearBucketRank(a?.year_bucket) ?? -Infinity) : (a?.[salesPushYearSort.key] ?? null);
    const right = salesPushYearSort.key === 'year_bucket' ? (getYearBucketRank(b?.year_bucket) ?? -Infinity) : (b?.[salesPushYearSort.key] ?? null);
    const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
    const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
    if (leftValue === rightValue) return (getYearBucketRank(a?.year_bucket) ?? 0) - (getYearBucketRank(b?.year_bucket) ?? 0);
    return salesPushYearSort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  const toggleSalesPushCategorySort = (key: 'cat2' | 'amount' | 'share_pct' | 'sku_count' | 'current_stock_amt' | 'ly_sales' | 'ly_sales_qty' | 'sales_rate_pct') => {
    setSalesPushCategorySort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'cat2' ? 'asc' : 'desc' }
    );
  };
  const getSalesPushCategorySortIndicator = (key: 'cat2' | 'amount' | 'share_pct' | 'sku_count' | 'current_stock_amt' | 'ly_sales' | 'ly_sales_qty' | 'sales_rate_pct') => {
    if (salesPushCategorySort.key !== key) return '';
    return salesPushCategorySort.direction === 'asc' ? ' ▲' : ' ▼';
  };
  const sortedSalesPushCategoryRows = [...salesPushCategoryRows].sort((a: any, b: any) => {
    const left = salesPushCategorySort.key === 'cat2' ? String(a?.cat2 || '') : (a?.[salesPushCategorySort.key] ?? null);
    const right = salesPushCategorySort.key === 'cat2' ? String(b?.cat2 || '') : (b?.[salesPushCategorySort.key] ?? null);
    if (typeof left === 'string' || typeof right === 'string') {
      const result = String(left || '').localeCompare(String(right || ''));
      return salesPushCategorySort.direction === 'asc' ? result : -result;
    }
    const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
    const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
    if (leftValue === rightValue) return String(a?.cat2 || '').localeCompare(String(b?.cat2 || ''));
    return salesPushCategorySort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  const toggleSalesPushSkuSort = (key: 'prdt_cd' | 'sales_push_stagnant_amt' | 'current_stock_amt' | 'ly_push_30d_tag_sales' | 'ly_push_30d_sales_qty' | 'sales_rate_pct') => {
    setSalesPushSkuSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'prdt_cd' ? 'asc' : 'desc' }
    );
  };
  const getSalesPushSkuSortIndicator = (key: 'prdt_cd' | 'sales_push_stagnant_amt' | 'current_stock_amt' | 'ly_push_30d_tag_sales' | 'ly_push_30d_sales_qty' | 'sales_rate_pct') => {
    if (salesPushSkuSort.key !== key) return '';
    return salesPushSkuSort.direction === 'asc' ? ' ▲' : ' ▼';
  };
  const sortedSalesPushSkuDetailRows = [...salesPushSkuDetailRows].sort((a: any, b: any) => {
    const left = salesPushSkuSort.key === 'prdt_cd' ? String(a?.prdt_cd || '') : (a?.[salesPushSkuSort.key] ?? null);
    const right = salesPushSkuSort.key === 'prdt_cd' ? String(b?.prdt_cd || '') : (b?.[salesPushSkuSort.key] ?? null);
    if (typeof left === 'string' || typeof right === 'string') {
      const result = String(left || '').localeCompare(String(right || ''));
      return salesPushSkuSort.direction === 'asc' ? result : -result;
    }
    const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
    const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
    if (leftValue === rightValue) return String(a?.prdt_cd || '').localeCompare(String(b?.prdt_cd || ''));
    return salesPushSkuSort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  const sortedSalesPushAllSkuRows = [...salesPushSkuRows].sort((a: any, b: any) => {
    const left = salesPushSkuSort.key === 'prdt_cd' ? String(a?.prdt_cd || '') : (a?.[salesPushSkuSort.key] ?? null);
    const right = salesPushSkuSort.key === 'prdt_cd' ? String(b?.prdt_cd || '') : (b?.[salesPushSkuSort.key] ?? null);
    if (typeof left === 'string' || typeof right === 'string') {
      const result = String(left || '').localeCompare(String(right || ''));
      return salesPushSkuSort.direction === 'asc' ? result : -result;
    }
    const leftValue = left === null || left === undefined || !Number.isFinite(left) ? -Infinity : Number(left);
    const rightValue = right === null || right === undefined || !Number.isFinite(right) ? -Infinity : Number(right);
    if (leftValue === rightValue) return String(a?.prdt_cd || '').localeCompare(String(b?.prdt_cd || ''));
    return salesPushSkuSort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });

  useEffect(() => {
    setSalesPushDetailData(null);
    setSalesPushDetailError(null);
    setSalesPushDetailLoading(false);
    salesPushDetailRequestKeyRef.current = null;
  }, [section3Data?.asof_date, section3Data?.brand, region, categoryFilter]);

  useEffect(() => {
    if (!salesPushModalOpen) return;
    if (hasSalesPushSkuDetail || salesPushDetailData) return;
    if (!canOpenSalesPushDetail) return;

    const date = String(section3Data?.asof_date || '');
    const brand = String(section3Data?.brand || '');
    if (!date || !brand) {
      setSalesPushDetailError(language === 'ko' ? '상세 조회 기준 정보가 없습니다.' : 'Missing detail query parameters.');
      return;
    }

    const requestKey = `${region}|${brand}|${date}|${categoryFilter}`;
    if (salesPushDetailRequestKeyRef.current === requestKey) return;
    salesPushDetailRequestKeyRef.current = requestKey;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    const fetchSalesPushDetail = async () => {
      try {
        setSalesPushDetailLoading(true);
        setSalesPushDetailError(null);
        const params = new URLSearchParams({
          region,
          brand,
          date,
          category_filter: categoryFilter,
          include_yoy: 'false',
        });
        const res = await fetch(`/api/section3/old-season-inventory?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        setSalesPushDetailData(json);
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          salesPushDetailRequestKeyRef.current = null;
          setSalesPushDetailLoading(false);
          setSalesPushDetailError(language === 'ko' ? '상세 조회 시간이 초과되었습니다. 잠시 후 다시 열어주세요.' : 'Detail request timed out. Please try again shortly.');
          return;
        }
        console.error('Failed to fetch sales-push detail data:', error);
        salesPushDetailRequestKeyRef.current = null;
        setSalesPushDetailError(language === 'ko' ? '상세 데이터를 불러오지 못했습니다.' : 'Failed to load detail data.');
      } finally {
        window.clearTimeout(timeoutId);
        if (!controller.signal.aborted) {
          setSalesPushDetailLoading(false);
        }
      }
    };

    fetchSalesPushDetail();
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    categoryFilter,
    hasSalesPushSkuDetail,
    language,
    region,
    salesPushDetailData,
    salesPushModalOpen,
    section3Data?.asof_date,
    section3Data?.brand,
    canOpenSalesPushDetail,
  ]);

  useEffect(() => {
    if (!selectedSalesPushYear) return;
    const hasYear = salesPushYearRows.some((row: any) => row.year_bucket === selectedSalesPushYear);
    if (!hasYear) {
      setSelectedSalesPushYear(null);
      setSelectedSalesPushCategory(null);
    }
  }, [salesPushYearRows, selectedSalesPushYear]);

  useEffect(() => {
    if (!selectedSalesPushYear || !selectedSalesPushCategory) return;
    const hasCategory = salesPushCategoryRows.some((row: any) => row.cat2 === selectedSalesPushCategory);
    if (!hasCategory) {
      setSelectedSalesPushCategory(null);
    }
  }, [salesPushCategoryRows, selectedSalesPushCategory, selectedSalesPushYear]);
  useEffect(() => {
    if (!selectedInventorySkuNode || !inventorySkuSectionRef.current) return;
    inventorySkuSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedInventorySkuNode]);
  useEffect(() => {
    if (!salesPushModalOpen) return;
    const firstYear = salesPushYearRows[0]?.year_bucket || null;
    setSelectedSalesPushYear(firstYear);
    setSelectedSalesPushCategory(null);
  }, [salesPushModalOpen, section3Data?.asof_date]);
  useEffect(() => {
    if (!salesPushModalOpen || !selectedSalesPushYear) return;
    const firstCategory = salesPushCategoryRows[0]?.cat2 || null;
    setSelectedSalesPushCategory(firstCategory);
  }, [salesPushModalOpen, selectedSalesPushYear]);
  const buildStagnantSkuRows = (yearBucket: string | undefined, cat2: string) => {
    const skuRows = Array.isArray(section3Data?.skus) ? section3Data.skus : [];
    return skuRows
      .filter((row: any) =>
        (!yearBucket || String(row?.year_bucket || '') === String(yearBucket)) &&
        String(row?.cat2 || '').toUpperCase() === String(cat2 || '').toUpperCase() &&
        Number(row?.stagnant_stock_amt || 0) > 0
      )
      .map((row: any) => {
        const currentStockAmt = Number(row?.curr_stock_amt || 0);
        const stagnantStockAmt = Number(row?.stagnant_stock_amt || 0);
        return {
          prdt_cd: String(row?.prdt_cd || '-'),
          curr_stock_amt: stagnantStockAmt,
          stagnant_stock_amt: stagnantStockAmt,
          stagnant_stock_qty: Number(row?.stagnant_stock_qty || 0),
          current_stock_amt: currentStockAmt,
          stagnant_ratio_pct: currentStockAmt > 0 ? (stagnantStockAmt / currentStockAmt) * 100 : null,
        };
      })
      .sort((a: any, b: any) => (b.curr_stock_amt - a.curr_stock_amt) || a.prdt_cd.localeCompare(b.prdt_cd));
  };
  const stagnantCurrentStockTotal =
    selectedInventoryCard?.key === 'stagnant'
      ? Number(summaryCards?.stagnant_card?.curr_stock_amt || 0)
      : 0;
  const stagnantRatioPct =
    isStagnantDetail && stagnantCurrentStockTotal > 0 && selectedInventoryCard
      ? (Number(selectedInventoryCard.curr_stock_amt || 0) / stagnantCurrentStockTotal) * 100
      : null;
  const getBreakdownRowMetrics = (row: any) => {
    const categoryNodes = Array.isArray(row?.category_nodes) ? row.category_nodes : [];
    const currentTotal = categoryNodes.reduce((sum: number, item: any) => sum + Number(item.curr_stock_amt || 0), 0);
    const lyTotal = categoryNodes.reduce((sum: number, item: any) => sum + Number(item.ly_curr_stock_amt || 0), 0);
    const salesTotal = categoryNodes.reduce((sum: number, item: any) => sum + Number(item.period_tag_sales || 0), 0);
    const lySalesTotal = categoryNodes.reduce((sum: number, item: any) => sum + Number(item.ly_period_tag_sales || 0), 0);
    const weightedActSales = categoryNodes.reduce((sum: number, item: any) => {
      const sales = Number(item.period_tag_sales || 0);
      const discountRate = Number(item.discount_rate || 0);
      return sum + sales * (1 - discountRate / 100);
    }, 0);
    const weightedLyActSales = categoryNodes.reduce((sum: number, item: any) => {
      const sales = Number(item.ly_period_tag_sales || 0);
      const diff = Number(item.discount_rate_diff_pct || 0);
      const currentRate = Number(item.discount_rate || 0);
      const lyRate = currentRate - diff;
      return sum + sales * (1 - lyRate / 100);
    }, 0);
    const discountRate = salesTotal > 0 ? (1 - weightedActSales / salesTotal) * 100 : null;
    const lyDiscountRate = lySalesTotal > 0 ? (1 - weightedLyActSales / lySalesTotal) * 100 : null;

    return {
      stockShareDiffPct:
        row.stock_share_diff_pct ??
        (selectedInventoryRowTotal > 0 && selectedInventoryRowLyTotal > 0
          ? (currentTotal / selectedInventoryRowTotal) * 100 -
            ((Number(row.ly_curr_stock_amt || 0) || lyTotal) / selectedInventoryRowLyTotal) * 100
          : null),
      periodTagSales: row.period_tag_sales ?? (salesTotal > 0 ? salesTotal : null),
      periodSalesDiffAmt:
        (row.period_tag_sales ?? salesTotal) > 0 || (row.ly_period_tag_sales ?? lySalesTotal) > 0
          ? Number(row.period_tag_sales ?? salesTotal) - Number(row.ly_period_tag_sales ?? lySalesTotal)
          : null,
      periodSalesYoyPct:
        row.period_sales_yoy_pct ?? (salesTotal > 0 || lySalesTotal > 0
          ? (lySalesTotal > 0 ? (salesTotal / lySalesTotal) * 100 : null)
          : null),
      discountRate: row.discount_rate ?? discountRate,
      discountRateDiffPct:
        row.discount_rate_diff_pct ??
        (discountRate !== null && lyDiscountRate !== null ? discountRate - lyDiscountRate : null),
    };
  };
  const selectedInventoryDetailNodes = !isStagnantDetail
    ? selectedInventoryRows.flatMap((row: any) => (Array.isArray(row?.category_nodes) ? row.category_nodes : []))
    : [];
  const selectedInventoryCurrentStockTotal = selectedInventoryRows.reduce((sum, row: any) => sum + Number(row.current_stock_amt || 0), 0);
  const selectedInventoryStagnantQtyTotal = selectedInventoryRows.reduce((sum, row: any) => sum + Number(row.stagnant_stock_qty || 0), 0);
  const selectedInventorySalesTotal = selectedInventoryDetailNodes.reduce((sum, node: any) => sum + Number(node.period_tag_sales || 0), 0);
  const selectedInventoryLySalesTotal = selectedInventoryDetailNodes.reduce((sum, node: any) => sum + Number(node.ly_period_tag_sales || 0), 0);
  const selectedInventoryWeightedActSales = selectedInventoryDetailNodes.reduce((sum, node: any) => {
    const sales = Number(node.period_tag_sales || 0);
    const discountRate = Number(node.discount_rate || 0);
    return sum + sales * (1 - discountRate / 100);
  }, 0);
  const selectedInventoryWeightedLyActSales = selectedInventoryDetailNodes.reduce((sum, node: any) => {
    const sales = Number(node.ly_period_tag_sales || 0);
    const currentRate = Number(node.discount_rate || 0);
    const diff = Number(node.discount_rate_diff_pct || 0);
    return sum + sales * (1 - (currentRate - diff) / 100);
  }, 0);
  const selectedInventoryTotalDiscountRate =
    selectedInventorySalesTotal > 0 ? (1 - selectedInventoryWeightedActSales / selectedInventorySalesTotal) * 100 : null;
  const selectedInventoryTotalLyDiscountRate =
    selectedInventoryLySalesTotal > 0 ? (1 - selectedInventoryWeightedLyActSales / selectedInventoryLySalesTotal) * 100 : null;
  const selectedInventoryTotalSalesDiff =
    selectedInventorySalesTotal > 0 || selectedInventoryLySalesTotal > 0 ? selectedInventorySalesTotal - selectedInventoryLySalesTotal : null;
  const selectedInventoryTotalSalesYoy =
    selectedInventoryLySalesTotal > 0 ? (selectedInventorySalesTotal / selectedInventoryLySalesTotal) * 100 : null;
  const selectedInventoryTotalDiscountRateDiff =
    selectedInventoryTotalDiscountRate !== null && selectedInventoryTotalLyDiscountRate !== null
      ? selectedInventoryTotalDiscountRate - selectedInventoryTotalLyDiscountRate
      : null;
  const activeInventoryCategoryLyTotal = activeInventoryCategoryRows.reduce((sum, row: any) => sum + Number(row.ly_curr_stock_amt || 0), 0);
  const activeInventoryCategoryCurrentStockTotal = activeInventoryCategoryRows.reduce((sum, row: any) => sum + Number(row.current_stock_amt || 0), 0);
  const activeInventoryCategoryStagnantQtyTotal = activeInventoryCategoryRows.reduce((sum, row: any) => sum + Number(row.stagnant_stock_qty || 0), 0);
  const activeInventoryCategorySalesTotal = activeInventoryCategoryRows.reduce((sum, row: any) => sum + Number(row.period_tag_sales || 0), 0);
  const activeInventoryCategoryLySalesTotal = activeInventoryCategoryRows.reduce((sum, row: any) => sum + Number(row.ly_period_tag_sales || 0), 0);
  const activeInventoryCategoryWeightedActSales = activeInventoryCategoryRows.reduce((sum, row: any) => {
    const sales = Number(row.period_tag_sales || 0);
    const discountRate = Number(row.discount_rate || 0);
    return sum + sales * (1 - discountRate / 100);
  }, 0);
  const activeInventoryCategoryWeightedLyActSales = activeInventoryCategoryRows.reduce((sum, row: any) => {
    const sales = Number(row.ly_period_tag_sales || 0);
    const currentRate = Number(row.discount_rate || 0);
    const diff = Number(row.discount_rate_diff_pct || 0);
    return sum + sales * (1 - (currentRate - diff) / 100);
  }, 0);
  const activeInventoryCategoryTotalDiscountRate =
    activeInventoryCategorySalesTotal > 0 ? (1 - activeInventoryCategoryWeightedActSales / activeInventoryCategorySalesTotal) * 100 : null;
  const activeInventoryCategoryTotalLyDiscountRate =
    activeInventoryCategoryLySalesTotal > 0 ? (1 - activeInventoryCategoryWeightedLyActSales / activeInventoryCategoryLySalesTotal) * 100 : null;
  const activeInventoryCategoryTotalSalesDiff =
    activeInventoryCategorySalesTotal > 0 || activeInventoryCategoryLySalesTotal > 0
      ? activeInventoryCategorySalesTotal - activeInventoryCategoryLySalesTotal
      : null;
  const activeInventoryCategoryTotalSalesYoy =
    activeInventoryCategoryLySalesTotal > 0 ? (activeInventoryCategorySalesTotal / activeInventoryCategoryLySalesTotal) * 100 : null;
  const activeInventoryCategoryTotalDiscountRateDiff =
    activeInventoryCategoryTotalDiscountRate !== null && activeInventoryCategoryTotalLyDiscountRate !== null
      ? activeInventoryCategoryTotalDiscountRate - activeInventoryCategoryTotalLyDiscountRate
      : null;
  /* const InventoryTreemapTooltip = ({ active, payload }: any) => {
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
  }; */

  return (
    <article className={`relative ${fixedHeight ? (simpleDetail ? 'h-[472px] overflow-hidden' : 'min-h-[488px]') : ''} rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 shadow-sm sm:p-5`}>
      <div className="mb-3 space-y-2">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="flex-1">
            <h3 className={`${isCompactEnglish ? 'text-[15px]' : 'text-base'} font-semibold leading-tight text-gray-900`}>
              {t(language, 'section3Title')}
              {seasonType && <span className="ml-2 text-xs font-medium text-gray-500">({seasonType})</span>}
            </h3>
          </div>

          <div className="flex w-full shrink-0 flex-wrap gap-2 text-left sm:w-auto sm:justify-end sm:text-right">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setDepletionPeriodMode('mtd')}
                className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  depletionPeriodMode === 'mtd' ? 'bg-orange-100 font-bold text-orange-900 ring-1 ring-inset ring-orange-300' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                MTD
              </button>
              <button
                type="button"
                onClick={() => setDepletionPeriodMode('ytd')}
                className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  depletionPeriodMode === 'ytd' ? 'bg-orange-100 font-bold text-orange-900 ring-1 ring-inset ring-orange-300' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                YTD
              </button>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => onCategoryFilterChange('clothes')}
                className={`px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  categoryFilter === 'clothes' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'clothesOnly')}
              </button>
              <button
                onClick={() => onCategoryFilterChange('all')}
                className={`border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  categoryFilter === 'all' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'allCategory')}
              </button>
            </div>
          </div>
        </div>

        {!simpleDetail ? (
          <div className="flex min-h-[26px] flex-wrap items-center gap-2">
            {!simpleDetail && periodStartInfo ? (
              <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-1 text-[10px] font-semibold text-orange-800 ring-1 ring-orange-100">
                {language === 'ko'
                  ? `${getPeriodModeLabel()} 소진기간 ${periodStartInfo.replace(/^\(|\)$/g, '')}`
                  : `${getPeriodModeLabel()} Period ${periodStartInfo.replace(/^\(|\)$/g, '')}`}
              </span>
            ) : null}
            {canOpenSalesPushDetail ? (
              <button
                type="button"
                onClick={() => {
                  if (simpleDetail) return;
                  setSalesPushModalOpen(true);
                }}
                className={`inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold leading-tight text-rose-700 ring-1 ring-rose-100 ${
                  simpleDetail ? '' : 'transition hover:bg-rose-100'
                }`}
              >
                <span>{language === 'ko' ? '판매Push 정체재고' : 'Sales-Push Stagnant'}</span>
                {salesPushSummary.totalAmt > 0 ? (
                  <span>{formatCurrency(salesPushSummary.totalAmt || 0)}</span>
                ) : null}
              </button>
            ) : null}
          </div>
        ) : null}
          {false && !simpleDetail && salesPushSummary.totalAmt > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSalesPushModalOpen(true)}
                className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                {language === 'ko' ? '판매Push 정체재고' : 'Sales-Push Stagnant'}
              </button>
              {salesPushWindow ? (
                <span className="text-[11px] text-gray-500">
                  {language === 'ko' ? `전년 동일 30일 판매 기준 ${salesPushWindow.start}~${salesPushWindow.end}` : `LY 30-day sales window ${salesPushWindow.start}~${salesPushWindow.end}`}
                </span>
              ) : null}
            </div>
          ) : null}
          {false && !simpleDetail && <p className="mt-1 text-[11px] text-gray-500">{currencyUnit}</p>}
      </div>

      <div className="grid grid-cols-3 items-stretch gap-2 sm:gap-3">
        {[kpis.k1, kpis.k2, kpis.k3].map((item, index) => (
          <div
            key={item.label}
            className={`h-full min-w-0 rounded-xl border p-2.5 sm:p-3 ${
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
            <div className={`flex items-start gap-2 ${simpleDetail ? 'min-h-[20px]' : ''}`}>
              <p className={`${isCompactEnglish ? 'text-[11px]' : 'text-xs'} text-gray-600`}>{item.label}</p>
              {!simpleDetail && index === 0 && mainPastSeasonLabel ? (
                <span className="inline-flex shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-700 ring-1 ring-indigo-100">
                  {mainPastSeasonLabel}
                </span>
              ) : null}
            </div>
            {simpleDetail ? <div className="min-h-[20px] text-[11px] leading-tight" /> : null}
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
            {!simpleDetail && index === 0 && (oldSeasonCards.length > 0 || oldSeasonTotalCard) ? (
              <div className="mt-2 grid gap-1.5">
                {oldSeasonCards.map((seasonCard) => (
                  <div
                    key={seasonCard.key}
                    className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 text-[10px] leading-tight text-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-indigo-800">{seasonCard.label}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(seasonCard.stockAmt)}</span>
                    </div>
                    <p className="mt-0.5 truncate">
                      {language === 'ko' ? '재고 YoY ' : 'Stock YoY '}
                      {seasonCard.stockYoyPct !== null ? (
                        <span className={`font-medium ${getInventoryYoyTone(seasonCard.stockYoyPct)}`}>
                          {formatPercent(seasonCard.stockYoyPct, 0)}
                        </span>
                      ) : (
                        <span className="font-medium text-gray-500">-</span>
                      )}
                    </p>
                  </div>
                ))}
                {oldSeasonTotalCard ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-[10px] leading-tight text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{oldSeasonTotalCard.label}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(oldSeasonTotalCard.stockAmt)}</span>
                    </div>
                    <p className="mt-0.5 truncate">
                      {language === 'ko' ? '재고 YoY ' : 'Stock YoY '}
                      {oldSeasonTotalCard.stockYoyPct !== null ? (
                        <span className={`font-medium ${getInventoryYoyTone(oldSeasonTotalCard.stockYoyPct)}`}>
                          {formatPercent(oldSeasonTotalCard.stockYoyPct, 0)}
                        </span>
                      ) : (
                        <span className="font-medium text-gray-500">-</span>
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!simpleDetail && index === 1 && oldSeasonCards.length > 0 ? (
              <div className="mt-2 grid gap-1.5">
                {oldSeasonCards.map((seasonCard) => (
                  <div
                    key={`${seasonCard.key}-sales`}
                    className="rounded-lg border border-orange-100 bg-orange-50/70 px-2 py-1.5 text-[10px] leading-tight text-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-orange-800">{seasonCard.label}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(seasonCard.salesAmt)}</span>
                    </div>
                    <p className="mt-0.5 truncate">
                      {language === 'ko' ? '소진 YoY ' : 'Depleted YoY '}
                      {seasonCard.salesYoyPct !== null ? (
                        <span className={`font-medium ${getInventoryYoyTone(seasonCard.salesYoyPct)}`}>
                          {formatPercent(seasonCard.salesYoyPct, 0)}
                        </span>
                      ) : (
                        <span className="font-medium text-gray-500">-</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            {!simpleDetail && index === 2 && oldSeasonCards.length > 0 ? (
              <div className="mt-2 grid gap-1.5">
                {oldSeasonCards.map((seasonCard) => (
                  <div
                    key={`${seasonCard.key}-discount`}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-[10px] leading-tight text-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-800">{seasonCard.label}</span>
                      <span className="font-semibold text-sky-700">{formatPercent(seasonCard.discountRate, 1)}</span>
                    </div>
                    <p className="mt-0.5 truncate">
                      <span className="font-medium text-gray-500">
                        {language === 'ko' ? '할인율' : 'Discount rate'}
                      </span>
                      <span className="ml-1">
                        {language === 'ko' ? '전년비 ' : 'vs LY '}
                        {seasonCard.discountRateDiffPct !== null ? (
                          <span className={`font-semibold ${getInventoryDiffTone(seasonCard.discountRateDiffPct)}`}>
                            {formatSignedPercentPoint(seasonCard.discountRateDiffPct)}
                          </span>
                        ) : (
                          <span className="font-medium text-gray-500">-</span>
                        )}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {simpleDetail && orderedInventorySegmentCards.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-500">
              {language === 'ko' ? '현재 재고 (TAG기준)' : isCompactEnglish ? 'Current stock (TAG)' : 'Based on current stock (TAG)'}
            </p>
            <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200">
              {`Total ${formatCurrency(orderedInventorySegmentCards.reduce((sum, card) => sum + Number(card.curr_stock_amt || 0), 0))}`}
            </span>
          </div>
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

      {selectedInventoryCard && Array.isArray(selectedInventoryCard.breakdown) && selectedInventoryCard.breakdown.length > 0 ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-4 py-6 backdrop-blur-[1px] sm:px-6 sm:py-8" onClick={() => { setSelectedInventoryCard(null); setSelectedInventoryNode(null); setSelectedInventorySkuNode(null); }}>
          <div className="max-h-[92vh] w-[min(1500px,96vw)] overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">
                  {getInventoryCardLabel(selectedInventoryCard.key, selectedInventoryCard.label)}
                </h4>
                <p className="mt-1 text-[11px] text-gray-500">
                  {selectedInventoryNode
                    ? (language === 'ko' ? '2글자 카테고리별 현재 재고입니다.' : 'Current stock by 2-letter category.')
                    : (language === 'ko' ? '재고(TAG), 재고 YoY와 세부 구성을 확인할 수 있습니다.' : 'Review stock (TAG), stock YoY, and detailed composition.')}
                </p>
                <p className="mt-1 text-[11px] text-gray-500">{getInventorySalesBasisInfo()}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedInventoryCard(null); setSelectedInventoryNode(null); setSelectedInventorySkuNode(null); }}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
              >
                {language === 'ko' ? '닫기' : 'Close'}
              </button>
            </div>
            {false ? (
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
            {isStagnantDetail ? (
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 px-3 py-2">
                  <p className="text-[11px] text-gray-500">{language === 'ko' ? '정체재고(TAG)' : 'Stagnant Stock (TAG)'}</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
                    {formatCurrency(selectedInventoryCard.curr_stock_amt || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-gray-500">{language === 'ko' ? '정체비중' : 'Stagnant Ratio'}</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-rose-700">
                    {stagnantRatioPct !== null ? formatPercent(stagnantRatioPct, 1) : '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-gray-500">{language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)'}</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
                    {formatCurrency(stagnantCurrentStockTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-gray-500">{language === 'ko' ? '전월말 대비' : 'vs Last Month End'}</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
                    {effectivePrevMonthStagnantRatio !== null
                      ? formatSignedPercentPoint((effectiveStagnantRatio - effectivePrevMonthStagnantRatio) * 100)
                      : '-'}
                  </p>
                </div>
              </div>
            ) : !isStagnantDetail ? (
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 px-3 py-2">
                  <p className="text-[11px] text-gray-500">{language === 'ko' ? '재고(TAG)' : 'Stock (TAG)'}</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
                    {formatCurrency(selectedInventoryCard.curr_stock_amt || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-gray-500">{language === 'ko' ? '재고 YoY' : 'Stock YoY'}</p>
                  <p className={`mt-1 text-base font-bold tabular-nums ${getInventoryYoyTone(selectedInventoryCard.yoy_pct)}`}>
                    {selectedInventoryCard.yoy_pct !== null && selectedInventoryCard.yoy_pct !== undefined
                      ? `${selectedInventoryCard.yoy_pct.toFixed(0)}%`
                      : '-'}
                  </p>
                </div>
                {selectedInventoryCard.sales_amt !== null && selectedInventoryCard.sales_amt !== undefined ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-500">{language === 'ko' ? '소진재고액' : 'Depleted Sales'}</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
                      {formatCurrency(selectedInventoryCard.sales_amt || 0)}
                    </p>
                  </div>
                ) : null}
                {selectedInventoryCard.sales_amt !== null && selectedInventoryCard.sales_amt !== undefined ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-500">{language === 'ko' ? '소진 YoY' : 'Depleted YoY'}</p>
                    <p className={`mt-1 text-base font-bold tabular-nums ${getInventoryYoyTone(selectedInventoryCard.sales_yoy_pct)}`}>
                      {selectedInventoryCard.sales_yoy_pct !== null && selectedInventoryCard.sales_yoy_pct !== undefined
                        ? `${selectedInventoryCard.sales_yoy_pct.toFixed(0)}%`
                        : '-'}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h5 className="text-sm font-semibold text-gray-900">
                  {selectedInventoryNode
                    ? (isStagnantDetail
                        ? (language === 'ko' ? '카테고리별 정체재고 상세' : 'Category Stagnant Stock Detail')
                        : (language === 'ko' ? '카테고리 재고 상세' : 'Category Stock Detail'))
                    : (isStagnantDetail
                        ? (language === 'ko' ? '정체재고 상세' : 'Stagnant Stock Detail')
                        : (language === 'ko' ? '재고 상세' : 'Stock Detail'))}
                </h5>
              </div>
              <div className="max-h-[360px] overflow-auto">
                <table className="min-w-full table-fixed text-sm">
                  <colgroup>
                    {isStagnantDetail ? (
                      <>
                        <col className="w-[120px]" />
                        <col className="w-[130px]" />
                        <col className="w-[110px]" />
                        <col className="w-[140px]" />
                        <col className="w-[120px]" />
                        <col className="w-[100px]" />
                        <col className="w-[88px]" />
                      </>
                    ) : (
                      <>
                        <col className="w-[120px]" />
                        <col className="w-[130px]" />
                        <col className="w-[110px]" />
                        <col className="w-[90px]" />
                        <col className="w-[110px]" />
                        <col className="w-[110px]" />
                        <col className="w-[120px]" />
                        <col className="w-[110px]" />
                        <col className="w-[90px]" />
                        <col className="w-[110px]" />
                        <col className="w-[88px]" />
                      </>
                    )}
                  </colgroup>
                  <thead className="bg-gray-50 text-gray-700">
                    <tr className="border-b border-gray-200">
                      <th className="w-[120px] whitespace-nowrap px-4 py-3 text-left font-semibold">
                        {selectedInventoryNode ? (language === 'ko' ? '카테고리' : 'Category') : (language === 'ko' ? '구분' : 'Segment')}
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{isStagnantDetail ? (language === 'ko' ? '정체재고(TAG)' : 'Stagnant Stock (TAG)') : (language === 'ko' ? '재고(TAG)' : 'Stock (TAG)')}</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{isStagnantDetail ? (language === 'ko' ? '정체비중' : 'Stagnant Ratio') : (language === 'ko' ? '재고 YoY' : 'Stock YoY')}</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{isStagnantDetail ? (language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)') : (language === 'ko' ? '비중' : 'Share')}</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{isStagnantDetail ? (language === 'ko' ? '정체재고 수량' : 'Stagnant Qty') : (language === 'ko' ? '비중 증감' : 'Share vs LY')}</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{isStagnantDetail ? (language === 'ko' ? '비중' : 'Share') : (language === 'ko' ? '소진액' : 'Depleted Sales')}</th>
                      <th className={`${isStagnantDetail ? 'w-[88px] px-3 text-center' : 'px-4 text-right'} whitespace-nowrap py-3 font-semibold`}>
                        {isStagnantDetail ? (language === 'ko' ? '상세' : 'Detail') : (language === 'ko' ? '소진액 증감' : 'Depleted Delta')}
                      </th>
                      {!isStagnantDetail ? (
                        <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                          {language === 'ko' ? '소진액 YoY' : 'Depleted YoY'}
                        </th>
                      ) : null}
                      {!isStagnantDetail ? <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{language === 'ko' ? '할인율' : 'Discount Rate'}</th> : null}
                      {!isStagnantDetail ? <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">{language === 'ko' ? '할인율 증감' : 'Discount vs LY'}</th> : null}
            {!isStagnantDetail ? (
                        <th className="w-[88px] whitespace-nowrap px-3 py-3 text-center font-semibold">{language === 'ko' ? '상세' : 'Detail'}</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {isStagnantDetail ? (
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatCurrency(selectedInventoryCard?.curr_stock_amt || selectedInventoryRowTotal || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                          {stagnantRatioPct !== null && stagnantRatioPct !== undefined ? formatPercent(stagnantRatioPct, 1) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatCurrency(selectedInventoryCurrentStockTotal || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                          {selectedInventoryStagnantQtyTotal > 0 ? formatQuantityPcs(selectedInventoryStagnantQtyTotal) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">100.0%</td>
                        <td className="w-[88px] px-3 py-3 text-center text-xs text-gray-400">-</td>
                      </tr>
                    ) : (
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatCurrency(selectedInventoryCard?.curr_stock_amt || selectedInventoryRowTotal || 0)}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(selectedInventoryCard?.yoy_pct)}`}>
                          {selectedInventoryCard?.yoy_pct !== null && selectedInventoryCard?.yoy_pct !== undefined ? `${selectedInventoryCard.yoy_pct.toFixed(0)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">100.0%</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-400">-</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {selectedInventorySalesTotal > 0 ? formatCurrency(selectedInventorySalesTotal) : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryDiffTone(selectedInventoryTotalSalesDiff)}`}>
                          {selectedInventoryTotalSalesDiff !== null && selectedInventoryTotalSalesDiff !== undefined ? formatSignedCurrency(selectedInventoryTotalSalesDiff) : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(selectedInventoryTotalSalesYoy)}`}>
                          {selectedInventoryTotalSalesYoy !== null && selectedInventoryTotalSalesYoy !== undefined ? `${selectedInventoryTotalSalesYoy.toFixed(0)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold italic tabular-nums text-sky-700">
                          {selectedInventoryTotalDiscountRate !== null && selectedInventoryTotalDiscountRate !== undefined ? formatPercent(selectedInventoryTotalDiscountRate, 1) : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${selectedInventoryTotalDiscountRateDiff !== null && selectedInventoryTotalDiscountRateDiff !== undefined ? (selectedInventoryTotalDiscountRateDiff > 0 ? 'text-red-600' : selectedInventoryTotalDiscountRateDiff < 0 ? 'text-green-600' : 'text-gray-600') : 'text-gray-400'}`}>
                          {selectedInventoryTotalDiscountRateDiff !== null && selectedInventoryTotalDiscountRateDiff !== undefined ? formatDiscountRateDiff(selectedInventoryTotalDiscountRateDiff) : '-'}
                        </td>
                        <td className="w-[88px] px-3 py-3 text-center text-xs text-gray-400">-</td>
                      </tr>
                    )}
                    {isStagnantDetail
                      ? selectedInventoryRows.map((row: any) => {
                          const hasCategoryNodes = Array.isArray(row.category_nodes) && row.category_nodes.length > 0;
                          return (
                            <tr
                              key={row.label_key}
                              onClick={() => {
                                if (!hasCategoryNodes) return;
                                setSelectedInventoryNode({
                                  name: getInventoryBreakdownLabel(row.label_key),
                                  categoryNodes: row.category_nodes,
                                });
                                setSelectedInventorySkuNode(null);
                              }}
                              className={`border-b border-gray-100 last:border-b-0 ${
                                activeInventoryNode?.name === getInventoryBreakdownLabel(row.label_key)
                                  ? 'bg-purple-50/70'
                                  : hasCategoryNodes
                                    ? 'cursor-pointer bg-white hover:bg-purple-50/40'
                                    : 'bg-white'
                              }`}
                            >
                              <td className="px-4 py-3 font-medium text-gray-900">{getInventoryBreakdownLabel(row.label_key)}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {formatCurrency(row.curr_stock_amt || 0)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                                {row.stagnant_ratio_pct !== null && row.stagnant_ratio_pct !== undefined ? formatPercent(row.stagnant_ratio_pct, 1) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {formatCurrency(row.current_stock_amt || 0)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                                {formatQuantityPcs(row.stagnant_stock_qty)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                {selectedInventoryRowTotal > 0 ? `${((row.curr_stock_amt / selectedInventoryRowTotal) * 100).toFixed(1)}%` : '-'}
                              </td>
                              <td className="w-[88px] px-3 py-3 text-center">
                                {hasCategoryNodes ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInventoryNode({
                                        name: getInventoryBreakdownLabel(row.label_key),
                                        categoryNodes: row.category_nodes,
                                      });
                                      setSelectedInventorySkuNode(null);
                                    }}
                                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                                      activeInventoryNode?.name === getInventoryBreakdownLabel(row.label_key)
                                        ? 'border-purple-200 bg-purple-50 text-purple-700'
                                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    {language === 'ko' ? '보기' : 'Open'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      : selectedInventoryRows.map((row: any) => {
                          const hasCategoryNodes = Array.isArray(row.category_nodes) && row.category_nodes.length > 0;
                          const derived = getBreakdownRowMetrics(row);
                          return (
                            <tr
                              key={row.label_key}
                              onClick={() => {
                                if (!hasCategoryNodes) return;
                                setSelectedInventoryNode({
                                  name: getInventoryBreakdownLabel(row.label_key),
                                  categoryNodes: row.category_nodes,
                                });
                                setSelectedInventorySkuNode(null);
                              }}
                              className={`border-b border-gray-100 last:border-b-0 ${
                                activeInventoryNode?.name === getInventoryBreakdownLabel(row.label_key)
                                  ? 'bg-purple-50/70'
                                  : hasCategoryNodes
                                    ? 'cursor-pointer bg-white hover:bg-purple-50/40'
                                    : 'bg-white'
                              }`}
                            >
                              <td className="px-4 py-3 font-medium text-gray-900">{getInventoryBreakdownLabel(row.label_key)}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {formatCurrency(row.curr_stock_amt || 0)}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(row.yoy_pct)}`}>
                                {row.yoy_pct !== null && row.yoy_pct !== undefined ? `${row.yoy_pct.toFixed(0)}%` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                {selectedInventoryRowTotal > 0 ? `${((row.curr_stock_amt / selectedInventoryRowTotal) * 100).toFixed(1)}%` : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${derived.stockShareDiffPct !== null && derived.stockShareDiffPct !== undefined ? (derived.stockShareDiffPct > 0 ? 'text-red-600' : derived.stockShareDiffPct < 0 ? 'text-green-600' : 'text-gray-600') : 'text-gray-400'}`}>
                                {derived.stockShareDiffPct !== null && derived.stockShareDiffPct !== undefined ? formatSignedPercentPoint(derived.stockShareDiffPct) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {derived.periodTagSales !== null && derived.periodTagSales !== undefined ? formatCurrency(derived.periodTagSales) : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryDiffTone(derived.periodSalesDiffAmt)}`}>
                                {derived.periodSalesDiffAmt !== null && derived.periodSalesDiffAmt !== undefined ? formatSignedCurrency(derived.periodSalesDiffAmt) : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(derived.periodSalesYoyPct)}`}>
                                {derived.periodSalesYoyPct !== null && derived.periodSalesYoyPct !== undefined ? `${derived.periodSalesYoyPct.toFixed(0)}%` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold italic tabular-nums text-sky-700">
                                {derived.discountRate !== null && derived.discountRate !== undefined ? formatPercent(derived.discountRate, 1) : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${derived.discountRateDiffPct !== null && derived.discountRateDiffPct !== undefined ? (derived.discountRateDiffPct > 0 ? 'text-red-600' : derived.discountRateDiffPct < 0 ? 'text-green-600' : 'text-gray-600') : 'text-gray-400'}`}>
                                {derived.discountRateDiffPct !== null && derived.discountRateDiffPct !== undefined ? formatDiscountRateDiff(derived.discountRateDiffPct) : '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {hasCategoryNodes ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInventoryNode({
                                        name: getInventoryBreakdownLabel(row.label_key),
                                        categoryNodes: row.category_nodes,
                                      });
                                      setSelectedInventorySkuNode(null);
                                    }}
                                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                                      activeInventoryNode?.name === getInventoryBreakdownLabel(row.label_key)
                                        ? 'border-purple-200 bg-purple-50 text-purple-700'
                                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    {language === 'ko' ? '보기' : 'Open'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>
            {activeInventoryNode && activeInventoryCategoryRows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h5 className="text-sm font-semibold text-gray-900">
                    {isStagnantDetail
                      ? (language === 'ko' ? `카테고리 상세 · ${activeInventoryNode.name}` : `Category Detail · ${activeInventoryNode.name}`)
                      : (language === 'ko' ? `소분류 카테고리 상세 · ${activeInventoryNode.name}` : `Subcategory Detail · ${activeInventoryNode.name}`)}
                  </h5>
                </div>
                <div className="max-h-[360px] overflow-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <colgroup>
                      {isStagnantDetail ? (
                        <>
                          <col className="w-[120px]" />
                          <col className="w-[140px]" />
                          <col className="w-[120px]" />
                          <col className="w-[90px]" />
                          <col className="w-[140px]" />
                          <col className="w-[120px]" />
                          <col className="w-[88px]" />
                        </>
                      ) : (
                        <>
                          <col className="w-[120px]" />
                          <col className="w-[140px]" />
                          <col className="w-[110px]" />
                          <col className="w-[90px]" />
                          <col className="w-[110px]" />
                          <col className="w-[110px]" />
                          <col className="w-[120px]" />
                          <col className="w-[110px]" />
                          <col className="w-[90px]" />
                          <col className="w-[110px]" />
                        </>
                      )}
                    </colgroup>
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="w-[120px] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          <button type="button" onClick={() => toggleInventoryCategorySort('cat2')} className="inline-flex w-full items-center justify-start whitespace-nowrap text-left transition hover:text-purple-700">
                            {language === 'ko' ? (isStagnantDetail ? '카테고리' : '소분류') : (isStagnantDetail ? 'Category' : 'Subcategory')}{getInventoryCategorySortIndicator('cat2')}
                          </button>
                        </th>
                        <th className="w-[140px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleInventoryCategorySort('curr_stock_amt')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                            {language === 'ko' ? (isStagnantDetail ? '정체재고(TAG)' : '재고(TAG)') : (isStagnantDetail ? 'Stagnant Stock (TAG)' : 'Stock (TAG)')}{getInventoryCategorySortIndicator('curr_stock_amt')}
                          </button>
                        </th>
                        <th className="w-[110px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleInventoryCategorySort(isStagnantDetail ? 'stagnant_ratio_pct' : 'yoy_pct')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                            {language === 'ko' ? (isStagnantDetail ? '정체비중' : '재고 YoY') : (isStagnantDetail ? 'Stagnant Ratio' : 'Stock YoY')}{getInventoryCategorySortIndicator(isStagnantDetail ? 'stagnant_ratio_pct' : 'yoy_pct')}
                          </button>
                        </th>
                        <th className="w-[90px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleInventoryCategorySort('share')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                            {language === 'ko' ? '비중' : 'Share'}{getInventoryCategorySortIndicator('share')}
                          </button>
                        </th>
                        <th className="w-[110px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleInventoryCategorySort(isStagnantDetail ? 'current_stock_amt' : 'stock_share_diff_pct')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                            {language === 'ko' ? (isStagnantDetail ? '현재재고(TAG)' : '비중 증감') : (isStagnantDetail ? 'Current Stock (TAG)' : 'Share vs LY')}{getInventoryCategorySortIndicator(isStagnantDetail ? 'current_stock_amt' : 'stock_share_diff_pct')}
                          </button>
                        </th>
                        <th className="w-[110px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleInventoryCategorySort(isStagnantDetail ? 'stagnant_stock_qty' : 'period_tag_sales')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                            {language === 'ko' ? (isStagnantDetail ? '정체재고 수량' : '소진액') : (isStagnantDetail ? 'Stagnant Qty' : 'Depleted Sales')}{getInventoryCategorySortIndicator(isStagnantDetail ? 'stagnant_stock_qty' : 'period_tag_sales')}
                          </button>
                        </th>
                        {!isStagnantDetail ? (
                          <th className="w-[120px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                            {language === 'ko' ? '소진액 증감' : 'Depleted Delta'}
                          </th>
                        ) : null}
                        {!isStagnantDetail ? (
                          <th className="w-[110px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                            <button type="button" onClick={() => toggleInventoryCategorySort('period_sales_yoy_pct')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                              {language === 'ko' ? '소진액 YoY' : 'Depleted YoY'}{getInventoryCategorySortIndicator('period_sales_yoy_pct')}
                            </button>
                          </th>
                        ) : null}
                        {!isStagnantDetail ? (
                          <th className="w-[90px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                            <button type="button" onClick={() => toggleInventoryCategorySort('discount_rate')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                              {language === 'ko' ? '할인율' : 'Discount Rate'}{getInventoryCategorySortIndicator('discount_rate')}
                            </button>
                          </th>
                        ) : null}
                        {!isStagnantDetail ? (
                          <th className="w-[110px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                            <button type="button" onClick={() => toggleInventoryCategorySort('discount_rate_diff_pct')} className="inline-flex w-full items-center justify-end whitespace-nowrap text-right transition hover:text-purple-700">
                              {language === 'ko' ? '할인율 증감' : 'Discount vs LY'}{getInventoryCategorySortIndicator('discount_rate_diff_pct')}
                            </button>
                          </th>
                        ) : null}
                        {isStagnantDetail ? <th className="w-[88px] whitespace-nowrap px-4 py-3 text-center font-semibold">{language === 'ko' ? '품번' : 'SKU'}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {isStagnantDetail ? (
                        <tr className="border-b border-gray-200 bg-gray-50/80">
                          <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(activeInventoryCategoryTotal || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                            {selectedInventoryNode?.categoryNodes?.length && activeInventoryCategoryCurrentStockTotal > 0
                              ? formatPercent((activeInventoryCategoryTotal / activeInventoryCategoryCurrentStockTotal) * 100, 1)
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">100.0%</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(activeInventoryCategoryCurrentStockTotal || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                            {activeInventoryCategoryStagnantQtyTotal > 0 ? formatQuantityPcs(activeInventoryCategoryStagnantQtyTotal) : '-'}
                          </td>
                          <td className="w-[88px] px-3 py-3 text-center text-xs text-gray-400">-</td>
                        </tr>
                      ) : (
                        <tr className="border-b border-gray-200 bg-gray-50/80">
                          <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(activeInventoryCategoryTotal || 0)}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(activeInventoryCategoryLyTotal > 0 ? (activeInventoryCategoryTotal / activeInventoryCategoryLyTotal) * 100 : null)}`}>
                            {activeInventoryCategoryLyTotal > 0 ? `${((activeInventoryCategoryTotal / activeInventoryCategoryLyTotal) * 100).toFixed(0)}%` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">100.0%</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-400">-</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {activeInventoryCategorySalesTotal > 0 ? formatCurrency(activeInventoryCategorySalesTotal) : '-'}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryDiffTone(activeInventoryCategoryTotalSalesDiff)}`}>
                            {activeInventoryCategoryTotalSalesDiff !== null && activeInventoryCategoryTotalSalesDiff !== undefined ? formatSignedCurrency(activeInventoryCategoryTotalSalesDiff) : '-'}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(activeInventoryCategoryTotalSalesYoy)}`}>
                            {activeInventoryCategoryTotalSalesYoy !== null && activeInventoryCategoryTotalSalesYoy !== undefined ? `${activeInventoryCategoryTotalSalesYoy.toFixed(0)}%` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold italic tabular-nums text-sky-700">
                            {activeInventoryCategoryTotalDiscountRate !== null && activeInventoryCategoryTotalDiscountRate !== undefined ? formatPercent(activeInventoryCategoryTotalDiscountRate, 1) : '-'}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${activeInventoryCategoryTotalDiscountRateDiff !== null && activeInventoryCategoryTotalDiscountRateDiff !== undefined ? (activeInventoryCategoryTotalDiscountRateDiff > 0 ? 'text-red-600' : activeInventoryCategoryTotalDiscountRateDiff < 0 ? 'text-green-600' : 'text-gray-600') : 'text-gray-400'}`}>
                            {activeInventoryCategoryTotalDiscountRateDiff !== null && activeInventoryCategoryTotalDiscountRateDiff !== undefined ? formatDiscountRateDiff(activeInventoryCategoryTotalDiscountRateDiff) : '-'}
                          </td>
                        </tr>
                      )}
                      {isStagnantDetail
                        ? sortedActiveInventoryCategoryRows.map((row: any) => (
                            <tr key={`${activeInventoryNode.name}-${row.cat2}`} className="border-b border-gray-100 last:border-b-0">
                              <td className="px-4 py-3 font-medium text-gray-900" title={getCategoryTooltipText(row.cat2)}>
                                {row.cat2}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {formatCurrency(row.curr_stock_amt || 0)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                                {row.stagnant_ratio_pct !== null && row.stagnant_ratio_pct !== undefined ? formatPercent(row.stagnant_ratio_pct, 1) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                {activeInventoryCategoryTotal > 0 ? `${((row.curr_stock_amt / activeInventoryCategoryTotal) * 100).toFixed(1)}%` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {formatCurrency(row.current_stock_amt || 0)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                                {formatQuantityPcs(row.stagnant_stock_qty)}
                              </td>
                              <td className="w-[88px] px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedInventorySkuNode({
                                      name: row.cat2,
                                      rows: buildStagnantSkuRows(row.year_bucket, row.cat2),
                                    })
                                  }
                                  className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                                    selectedInventorySkuNode?.name === row.cat2
                                      ? 'border-purple-200 bg-purple-50 text-purple-700'
                                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {language === 'ko' ? '보기' : 'Open'}
                                </button>
                              </td>
                            </tr>
                          ))
                        : sortedActiveInventoryCategoryRows.map((row: any) => {
                            const depletedSalesDiff =
                              (row.period_tag_sales ?? 0) > 0 || (row.ly_period_tag_sales ?? 0) > 0
                                ? Number(row.period_tag_sales ?? 0) - Number(row.ly_period_tag_sales ?? 0)
                                : null;
                            return (
                            <tr key={`${activeInventoryNode.name}-${row.cat2}`} className="border-b border-gray-100 last:border-b-0">
                              <td className="px-4 py-3 font-medium text-gray-900" title={getCategoryTooltipText(row.cat2)}>
                                {row.cat2}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {formatCurrency(row.curr_stock_amt || 0)}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(row.yoy_pct)}`}>
                                {row.yoy_pct !== null && row.yoy_pct !== undefined ? `${row.yoy_pct.toFixed(0)}%` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                {activeInventoryCategoryTotal > 0 ? `${((row.curr_stock_amt / activeInventoryCategoryTotal) * 100).toFixed(1)}%` : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.stock_share_diff_pct !== null && row.stock_share_diff_pct !== undefined ? (row.stock_share_diff_pct > 0 ? 'text-red-600' : row.stock_share_diff_pct < 0 ? 'text-green-600' : 'text-gray-600') : 'text-gray-400'}`}>
                                {row.stock_share_diff_pct !== null && row.stock_share_diff_pct !== undefined ? formatSignedPercentPoint(row.stock_share_diff_pct) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                                {row.period_tag_sales !== null && row.period_tag_sales !== undefined ? formatCurrency(row.period_tag_sales) : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryDiffTone(depletedSalesDiff)}`}>
                                {depletedSalesDiff !== null && depletedSalesDiff !== undefined ? formatSignedCurrency(depletedSalesDiff) : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${getInventoryYoyTone(row.period_sales_yoy_pct)}`}>
                                {row.period_sales_yoy_pct !== null && row.period_sales_yoy_pct !== undefined ? `${row.period_sales_yoy_pct.toFixed(0)}%` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold italic tabular-nums text-sky-700">
                                {row.discount_rate !== null && row.discount_rate !== undefined ? formatPercent(row.discount_rate, 1) : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.discount_rate_diff_pct !== null && row.discount_rate_diff_pct !== undefined ? (row.discount_rate_diff_pct > 0 ? 'text-red-600' : row.discount_rate_diff_pct < 0 ? 'text-green-600' : 'text-gray-600') : 'text-gray-400'}`}>
                                {row.discount_rate_diff_pct !== null && row.discount_rate_diff_pct !== undefined ? formatDiscountRateDiff(row.discount_rate_diff_pct) : '-'}
                              </td>
                            </tr>
                          )})}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {isStagnantDetail && selectedInventorySkuNode && selectedInventorySkuNode.rows.length > 0 ? (
              <div ref={inventorySkuSectionRef} className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h5 className="text-sm font-semibold text-gray-900">
                    {language === 'ko' ? `품번 상세 · ${selectedInventorySkuNode.name}` : `SKU Detail · ${selectedInventorySkuNode.name}`}
                  </h5>
                </div>
                <div className="max-h-[360px] overflow-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left font-semibold">{language === 'ko' ? '품번' : 'SKU'}</th>
                        <th className="px-4 py-3 text-right font-semibold">{language === 'ko' ? '정체재고(TAG)' : 'Stagnant Stock (TAG)'}</th>
                        <th className="px-4 py-3 text-right font-semibold">{language === 'ko' ? '정체비중' : 'Stagnant Ratio'}</th>
                        <th className="px-4 py-3 text-right font-semibold">{language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)'}</th>
                        <th className="px-4 py-3 text-right font-semibold">{language === 'ko' ? '정체재고 수량' : 'Stagnant Qty'}</th>
                        <th className="px-4 py-3 text-right font-semibold">{language === 'ko' ? '비중' : 'Share'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInventorySkuNode.rows.map((row) => (
                        <tr key={`${selectedInventorySkuNode.name}-${row.prdt_cd}`} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-gray-900">{row.prdt_cd}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(row.curr_stock_amt || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                            {row.stagnant_ratio_pct !== null && row.stagnant_ratio_pct !== undefined ? formatPercent(row.stagnant_ratio_pct, 1) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(row.current_stock_amt || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                            {formatQuantityPcs(row.stagnant_stock_qty)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {selectedInventorySkuTotal > 0 ? `${((row.curr_stock_amt / selectedInventorySkuTotal) * 100).toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {getInventoryCardTooltip(selectedInventoryCard.key) ? (
              <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
                {getInventoryCardTooltip(selectedInventoryCard.key)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {salesPushModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-4 py-6 backdrop-blur-[1px] sm:px-6 sm:py-8"
          onClick={() => setSalesPushModalOpen(false)}
        >
          <div
            className="max-h-[92vh] w-[min(1480px,96vw)] overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-lg font-semibold text-gray-900">
                  {language === 'ko' ? '판매Push 정체재고' : 'Sales-Push Stagnant'}
                </h4>
                <div className="mt-2 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2">
                  <p className="text-[12px] font-semibold text-rose-800">
                    {language === 'ko' ? '판매Push 정체재고' : 'Sales-Push Stagnant'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-700">
                    {language === 'ko'
                      ? '전년 동일 30일 TAG 판매가 현재 재고의 5% 이상인 정체 품번입니다. 판매율이 높았던 재고는 지체없이 판매 진행을 추천합니다.'
                      : 'Stagnant SKUs whose LY same 30-day TAG sales were at least 5% of current stock. We recommend immediate sell-through action for items with strong sales rate.'}
                  </p>
                </div>
                {salesPushWindow ? (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {language === 'ko'
                      ? `비교 구간: ${salesPushWindow.start}~${salesPushWindow.end}`
                      : `Comparison window: ${salesPushWindow.start}~${salesPushWindow.end}`}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setSalesPushModalOpen(false)}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
                >
                  {language === 'ko' ? '닫기' : 'Close'}
                </button>
                <button
                  type="button"
                  onClick={() => setExcludeUnder10Pcs((prev) => !prev)}
                  className={`inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[13px] font-semibold shadow-sm transition ${
                    excludeUnder10Pcs
                      ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {excludeUnder10Pcs
                    ? (language === 'ko' ? '재고 10pcs미만 표시' : 'Show Stock Under 10 pcs')
                    : (language === 'ko' ? '10pcs 미만 제외' : 'Exclude Under 10 pcs')}
                </button>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-orange-50 px-3 py-2">
                <p className="text-[11px] text-gray-500">{language === 'ko' ? '판매Push 정체재고(TAG)' : 'Sales-Push Stagnant (TAG)'}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-gray-900">{formatCurrency(salesPushSummary.totalAmt || 0)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <p className="text-[11px] text-gray-500">{language === 'ko' ? '대상 품번 수' : 'Target SKU Count'}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-gray-900">{salesPushSummary.totalSkuCount}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <p className="text-[11px] text-gray-500">{language === 'ko' ? '전체 정체재고 대비 비중' : 'Share of Stagnant'}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-rose-700">
                  {salesPushSummary.shareOfStagnantPct !== null ? formatPercent(salesPushSummary.shareOfStagnantPct, 1) : '-'}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <p className="text-[11px] text-gray-500">{language === 'ko' ? '전년 동기 30일 판매액(TAG)' : 'LY 30-Day Sales (TAG)'}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-gray-900">{formatCurrency(salesPushSummary.totalLySales || 0)}</p>
              </div>
            </div>

            {salesPushDetailLoading || salesPushDetailError || (!salesPushDetailLoading && !salesPushDetailError && salesPushSummary.totalAmt > 0 && sortedSalesPushYearRows.length === 0) ? (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                salesPushDetailError
                  ? 'border-rose-100 bg-rose-50 text-rose-700'
                  : salesPushDetailLoading
                    ? 'border-violet-100 bg-violet-50 text-violet-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}>
                {salesPushDetailError ||
                  (salesPushDetailLoading
                    ? (language === 'ko' ? '상세 데이터를 불러오는 중입니다.' : 'Loading detail data.')
                    : (language === 'ko' ? '상세 품번 데이터가 아직 준비되지 않았습니다.' : 'Detail SKU data is not available yet.'))}
              </div>
            ) : null}

            {sortedSalesPushAllSkuRows.length > 0 ? (
              <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-semibold text-gray-900">
                      {language === 'ko' ? 'Push 대상 품번' : 'Push Target SKUs'}
                    </h5>
                    {excludeUnder10Pcs ? (
                      <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">
                        {language === 'ko' ? '10pcs 이상만 표시' : '10+ pcs only'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200">
                        {language === 'ko' ? '10pcs 미만 포함' : 'Including under 10 pcs'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="max-h-[320px] overflow-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="w-[120px] px-4 py-3 text-left font-semibold">
                          <button type="button" onClick={() => toggleSalesPushSkuSort('prdt_cd')} className="inline-flex w-full items-center justify-start gap-1 text-left leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '품번' : 'SKU'}{getSalesPushSkuSortIndicator('prdt_cd')}
                          </button>
                        </th>
                        <th className="w-[120px] px-4 py-3 text-left font-semibold">
                          {language === 'ko' ? '연차' : 'Year'}
                        </th>
                        <th className="w-[100px] px-4 py-3 text-left font-semibold">
                          {language === 'ko' ? '카테고리' : 'Category'}
                        </th>
                        <th className="w-[150px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushSkuSort('current_stock_amt')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)'}{getSalesPushSkuSortIndicator('current_stock_amt')}
                          </button>
                        </th>
                        <th className="w-[100px] px-4 py-3 text-right font-semibold">
                          {language === 'ko' ? '재고수량' : 'Stock Qty'}
                        </th>
                        <th className="w-[170px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushSkuSort('sales_push_stagnant_amt')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '판매Push 정체재고(TAG)' : 'Sales-Push Stagnant (TAG)'}{getSalesPushSkuSortIndicator('sales_push_stagnant_amt')}
                          </button>
                        </th>
                        <th className="w-[110px] px-4 py-3 text-right font-semibold">
                          {language === 'ko' ? '정체재고 수량' : 'Stagnant Qty'}
                        </th>
                        <th className="w-[190px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushSkuSort('ly_push_30d_tag_sales')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '전년 동기 30일 판매액(TAG)' : 'LY 30-Day Sales (TAG)'}{getSalesPushSkuSortIndicator('ly_push_30d_tag_sales')}
                          </button>
                        </th>
                        <th className="w-[130px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushSkuSort('ly_push_30d_sales_qty')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '전년 동기 30일 판매수량' : 'LY 30-Day Sales Qty'}{getSalesPushSkuSortIndicator('ly_push_30d_sales_qty')}
                          </button>
                        </th>
                        <th className="w-[110px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushSkuSort('sales_rate_pct')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '판매율' : 'Sales Rate'}{getSalesPushSkuSortIndicator('sales_rate_pct')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSalesPushAllSkuRows.map((row: any) => (
                        <tr key={`push-all-${row.year_bucket}-${row.cat2}-${row.prdt_cd}`} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-gray-900">{row.prdt_cd}</td>
                          <td className="px-4 py-3 text-gray-700">{row.year_bucket}</td>
                          <td className="px-4 py-3 text-gray-700" title={getCategoryTooltipText(row.cat2)}>
                            {row.cat2}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.current_stock_amt || 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatQuantityPcs(row.current_stock_qty)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.sales_push_stagnant_amt || 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatQuantityPcs(row.sales_push_stagnant_qty)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.ly_push_30d_tag_sales || 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatQuantityPcs(row.ly_push_30d_sales_qty)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">{row.sales_rate_pct !== null && row.sales_rate_pct !== undefined ? formatPercent(row.sales_rate_pct, 2) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sticky bottom-0 border-t border-gray-200 bg-amber-50/95 backdrop-blur">
                  <table className="min-w-full table-fixed text-sm">
                    <tbody>
                      <tr>
                        <td className="w-[120px] px-4 py-3 font-semibold text-gray-900">
                          {language === 'ko' ? 'Total' : 'Total'}
                        </td>
                        <td className="w-[120px] px-4 py-3 text-gray-500">-</td>
                        <td className="w-[100px] px-4 py-3 text-gray-500">-</td>
                        <td className="w-[150px] px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatCurrency(salesPushSummary.totalCurrentStockAmt || 0)}
                        </td>
                        <td className="w-[100px] px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                          {formatQuantityPcs(Number(salesPushSummary.totalCurrentStockQty || 0))}
                        </td>
                        <td className="w-[170px] px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatCurrency(salesPushSummary.totalAmt || 0)}
                        </td>
                        <td className="w-[110px] px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                          {formatQuantityPcs(Number(salesPushSummary.totalStagnantQty || 0))}
                        </td>
                        <td className="w-[190px] px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatCurrency(salesPushSummary.totalLySales || 0)}
                        </td>
                        <td className="w-[130px] px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                          {formatQuantityPcs(Number(salesPushSummary.totalLySalesQty || 0))}
                        </td>
                        <td className="w-[110px] px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                          {salesPushSummary.totalSalesRatePct !== null ? formatPercent(salesPushSummary.totalSalesRatePct, 2) : '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h5 className="text-sm font-semibold text-gray-900">
                  {language === 'ko' ? '판매Push 정체재고 상세' : 'Sales-Push Stagnant Detail'}
                </h5>
              </div>
              <div className="max-h-[320px] overflow-auto">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr className="border-b border-gray-200">
                      <th className="w-[130px] px-4 py-3 text-left font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('year_bucket')} className="inline-flex w-full items-center justify-start gap-1 text-left leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '구분' : 'Segment'}{getSalesPushYearSortIndicator('year_bucket')}
                        </button>
                      </th>
                      <th className="w-[150px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('current_stock_amt')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)'}{getSalesPushYearSortIndicator('current_stock_amt')}
                        </button>
                      </th>
                      <th className="w-[190px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('amount')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '판매Push 정체재고(TAG)' : 'Sales-Push Stagnant (TAG)'}{getSalesPushYearSortIndicator('amount')}
                        </button>
                      </th>
                      <th className="w-[100px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('share_pct')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '비중' : 'Share'}{getSalesPushYearSortIndicator('share_pct')}
                        </button>
                      </th>
                      <th className="w-[120px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('sku_count')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '대상 품번 수' : 'Target SKUs'}{getSalesPushYearSortIndicator('sku_count')}
                        </button>
                      </th>
                      <th className="w-[180px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('ly_sales')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '전년 동기 30일 판매액(TAG)' : 'LY 30-Day Sales (TAG)'}{getSalesPushYearSortIndicator('ly_sales')}
                        </button>
                      </th>
                      <th className="w-[130px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('ly_sales_qty')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '전년 동기 30일 판매수량' : 'LY 30-Day Sales Qty'}{getSalesPushYearSortIndicator('ly_sales_qty')}
                        </button>
                      </th>
                      <th className="w-[110px] px-4 py-3 text-right font-semibold">
                        <button type="button" onClick={() => toggleSalesPushYearSort('sales_rate_pct')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                          {language === 'ko' ? '판매율' : 'Sales Rate'}{getSalesPushYearSortIndicator('sales_rate_pct')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSalesPushYearRows.map((row: any) => (
                      <tr
                        key={row.year_bucket}
                        onClick={() => {
                          setSelectedSalesPushYear(row.year_bucket);
                          setSelectedSalesPushCategory(null);
                        }}
                        className={`border-b border-gray-100 last:border-b-0 ${
                          selectedSalesPushYear === row.year_bucket ? 'bg-purple-50/70' : 'cursor-pointer bg-white hover:bg-purple-50/40'
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{row.year_bucket}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.current_stock_amt || 0)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.amount || 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.share_pct !== null && row.share_pct !== undefined ? formatPercent(row.share_pct, 1) : '-'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.sku_count}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.ly_sales || 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatQuantityPcs(row.ly_sales_qty)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">{row.sales_rate_pct !== null && row.sales_rate_pct !== undefined ? formatPercent(row.sales_rate_pct, 2) : '-'}</td>
                      </tr>
                    ))}
                    {sortedSalesPushYearRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                          {salesPushDetailLoading
                            ? (language === 'ko' ? '상세 데이터를 불러오는 중입니다.' : 'Loading detail data.')
                            : salesPushDetailError
                              ? salesPushDetailError
                              : (language === 'ko' ? '표시할 상세 데이터가 없습니다.' : 'No detail rows to display.')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedSalesPushYear && salesPushCategoryRows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h5 className="text-sm font-semibold text-gray-900">
                    {language === 'ko' ? `카테고리 상세 · ${selectedSalesPushYear}` : `Category Detail · ${selectedSalesPushYear}`}
                  </h5>
                </div>
                <div className="max-h-[320px] overflow-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="w-[130px] px-4 py-3 text-left font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('cat2')} className="inline-flex w-full items-center justify-start gap-1 text-left leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '카테고리' : 'Category'}{getSalesPushCategorySortIndicator('cat2')}
                          </button>
                        </th>
                        <th className="w-[150px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('current_stock_amt')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)'}{getSalesPushCategorySortIndicator('current_stock_amt')}
                          </button>
                        </th>
                        <th className="w-[190px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('amount')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '판매Push 정체재고(TAG)' : 'Sales-Push Stagnant (TAG)'}{getSalesPushCategorySortIndicator('amount')}
                          </button>
                        </th>
                        <th className="w-[100px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('share_pct')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '비중' : 'Share'}{getSalesPushCategorySortIndicator('share_pct')}
                          </button>
                        </th>
                        <th className="w-[120px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('sku_count')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '대상 품번 수' : 'Target SKUs'}{getSalesPushCategorySortIndicator('sku_count')}
                          </button>
                        </th>
                        <th className="w-[180px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('ly_sales')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '전년 동기 30일 판매액(TAG)' : 'LY 30-Day Sales (TAG)'}{getSalesPushCategorySortIndicator('ly_sales')}
                          </button>
                        </th>
                        <th className="w-[130px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('ly_sales_qty')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '전년 동기 30일 판매수량' : 'LY 30-Day Sales Qty'}{getSalesPushCategorySortIndicator('ly_sales_qty')}
                          </button>
                        </th>
                        <th className="w-[110px] px-4 py-3 text-right font-semibold">
                          <button type="button" onClick={() => toggleSalesPushCategorySort('sales_rate_pct')} className="inline-flex w-full items-center justify-end gap-1 text-right leading-tight transition hover:text-purple-700">
                            {language === 'ko' ? '판매율' : 'Sales Rate'}{getSalesPushCategorySortIndicator('sales_rate_pct')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSalesPushCategoryRows.map((row: any) => (
                        <tr
                          key={`${selectedSalesPushYear}-${row.cat2}`}
                          onClick={() => setSelectedSalesPushCategory(row.cat2)}
                          className={`border-b border-gray-100 last:border-b-0 ${
                            selectedSalesPushCategory === row.cat2 ? 'bg-purple-50/70' : 'cursor-pointer bg-white hover:bg-purple-50/40'
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900" title={getCategoryTooltipText(row.cat2)}>
                            {row.cat2}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.current_stock_amt || 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.amount || 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.share_pct !== null && row.share_pct !== undefined ? formatPercent(row.share_pct, 1) : '-'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.sku_count}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(row.ly_sales || 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatQuantityPcs(row.ly_sales_qty)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">{row.sales_rate_pct !== null && row.sales_rate_pct !== undefined ? formatPercent(row.sales_rate_pct, 2) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {selectedSalesPushYear && selectedSalesPushCategory && salesPushSkuDetailRows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h5 className="text-sm font-semibold text-gray-900">
                    {language === 'ko'
                      ? `품번 상세 · ${selectedSalesPushYear} / ${selectedSalesPushCategory}`
                      : `SKU Detail · ${selectedSalesPushYear} / ${selectedSalesPushCategory}`}
                  </h5>
                </div>
                <div className="max-h-[360px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr className="border-b border-gray-200">
                        <th className="w-[140px] px-4 py-3 text-left font-semibold">{language === 'ko' ? '품번' : 'SKU'}</th>
                        <th className="w-[170px] px-4 py-3 text-right font-semibold">{language === 'ko' ? '현재 정체재고(TAG)' : 'Current Stagnant (TAG)'}</th>
                        <th className="w-[160px] px-4 py-3 text-right font-semibold">{language === 'ko' ? '현재재고(TAG)' : 'Current Stock (TAG)'}</th>
                        <th className="w-[190px] px-4 py-3 text-right font-semibold">{language === 'ko' ? '전년 동기 30일 판매액(TAG)' : 'LY 30-Day Sales (TAG)'}</th>
                        <th className="w-[130px] px-4 py-3 text-right font-semibold">{language === 'ko' ? '전년 동기 30일 판매수량' : 'LY 30-Day Sales Qty'}</th>
                        <th className="w-[120px] px-4 py-3 text-right font-semibold">{language === 'ko' ? '판매율' : 'Sales Rate'}</th>
                        <th className="w-[110px] px-4 py-3 text-center font-semibold">{language === 'ko' ? '판정' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSalesPushSkuDetailRows.map((row: any) => (
                        <tr key={`${row.year_bucket}-${row.cat2}-${row.prdt_cd}`} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-gray-900">{row.prdt_cd}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(row.sales_push_stagnant_amt || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(row.current_stock_amt || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                            {formatCurrency(row.ly_push_30d_tag_sales || 0)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {formatQuantityPcs(row.ly_push_30d_sales_qty)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                            {row.sales_rate_pct !== null && row.sales_rate_pct !== undefined ? formatPercent(row.sales_rate_pct, 2) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                              {language === 'ko' ? 'Push 대상' : 'Push Target'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium leading-tight text-purple-700 ring-1 ring-purple-100">
              {language === 'ko' ? '아래 카드를 누르면 재고 상세가 열립니다.' : 'Tap the cards below to open stock detail.'}
            </p>
            {detailSeasonLabel ? (
              <p className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium leading-tight text-amber-800 ring-1 ring-amber-100">
                {language === 'ko' ? `세부 카드 기준: ${detailSeasonLabel}` : `Detail cards: ${detailSeasonLabel}`}
              </p>
            ) : null}
          </div>
          <div className={`grid grid-cols-1 items-stretch md:grid-cols-5 ${fixedHeight ? 'gap-1.5' : 'gap-2'}`}>
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
                <div key={card.key} className="flex h-full min-w-0 flex-col">
                <button
                  type="button"
                  onClick={() => {
                    const detailCard = inventoryDetailCardMap.get(card.key);
                    if (!detailCard) return;
                    setSelectedInventoryCard(detailCard);
                    setSelectedInventoryNode(null);
                    setSelectedInventorySkuNode(null);
                  }}
                  className={`flex h-full w-full flex-col rounded-lg border ${fixedHeight ? 'p-2.5' : 'p-3'} ${progressCardClassName} text-left transition hover:border-gray-300 hover:shadow-md`}
                >
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
                  <div className={`${fixedHeight ? 'mt-1.5 space-y-0' : 'mt-2.5 space-y-0.5'} flex-1`}>
                    {card.key === 'stagnant' ? (
                      <>
                        {renderMetricLine(
                          language === 'ko' ? '정체비중' : 'Stagnant Ratio',
                          formatPercent((card.stagnantRatio ?? 0) * 100, 1),
                          'text-gray-900'
                        )}
                        {renderMetricLine(
                          t(language, 'vsLastMonthEnd'),
                          card.prevMonthStagnantRatio !== null && card.prevMonthStagnantRatio !== undefined
                            ? formatSignedPercentPoint(((card.stagnantRatio ?? 0) - card.prevMonthStagnantRatio) * 100)
                            : '-',
                          card.prevMonthStagnantRatio !== null && card.prevMonthStagnantRatio !== undefined
                            ? (((card.stagnantRatio ?? 0) - card.prevMonthStagnantRatio) * 100 > 0 ? 'text-red-600' : 'text-green-600')
                            : 'text-gray-400'
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
                </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!simpleDetail && (
        <div className="mt-4 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
          {language === 'ko' ? `단위 : ${currencyCode}${t(language, 'tagBasis')}` : `Unit: ${currencyCode} ${t(language, 'tagBasis')}`}
        </div>
      )}
    </article>
  );
}
