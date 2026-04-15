'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { t, type Language } from '@/lib/translations';
import { getStoreShortCode } from '@/lib/store-name-utils';
import { getStoreArea } from '@/lib/store-area-utils';
import type { Section1CategoryDetailKey } from '@/lib/section1/category-detail';
import Section1AllStoresTreemapModal, { type Section1AllStoresTreemapItem } from './Section1AllStoresTreemapModal';
import Section1CategoryDetailModal from './Section1CategoryDetailModal';
import Section1StoreDetailModal from './Section1StoreDetailModal';
import Section1StoreCountMatrixModal from './Section1StoreCountMatrixModal';

interface Section1CardProps {
  isYtdMode: boolean;
  section1Data: any;
  language: Language;
  brand: string;
  region: string;
  date: string;
  onYtdModeToggle?: () => void;
  showSeasonCategory?: boolean;
  detailViewMode?: DetailView;
  onDetailViewModeChange?: (view: DetailView) => void;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
  simpleDetail?: boolean;
  fixedHeight?: boolean;
  openAllStoresRequestKey?: number;
}

type KpiBlock = {
  label: string;
  value: string;
  discountRate?: string;
  discountDiff?: string;
  projectedSales?: string;
  projectedYoy?: string;
  projectedYoyRaw?: number | null;
  projectedTooltip?: string;
  projectedLabel?: string;
  projectedValue?: string;
  projectedSummary?: string;
  sameStoreValue?: string;
  sameStoreTooltip?: string;
  storeCountFlow?: string;
  offlineStoreCountFlow?: string;
  onlineStoreCountFlow?: string;
};

type DetailView = 'season' | 'top5' | 'worst5';

type StoreMetricCard = {
  key: string;
  title: string;
  storeCode: string;
  fullName: string;
  area: number | null;
  sales: number;
  prevSales: number;
  yoy: number | null;
  discountRate: number | null;
  discountDiff: number | null;
};

type SelectedStore = {
  shopCd: string;
  storeName: string;
};

type SelectedCategoryDetail = {
  key: Section1CategoryDetailKey;
  title: string;
};

type StoreCountMatrixItem = {
  shopCd: string;
  shopName: string;
  channel: string;
  currentSales: number;
  previousSales: number;
  yoy: number | null;
  discountRate: number | null;
  discountDiff: number | null;
};

function getTreemapStoreShortName(store: any): string {
  const storeCode = String(store.shop_cd || '');
  const fullName = String(store.shop_name || storeCode || '-');

  if (storeCode === 'MC3') return 'SEN';
  if (storeCode === 'MC4') return 'Sen(O)';

  return getStoreShortCode(fullName) || fullName;
}

export default function Section1Card({
  isYtdMode,
  section1Data,
  language,
  brand,
  region,
  date,
  onYtdModeToggle,
  showSeasonCategory = true,
  detailViewMode,
  onDetailViewModeChange,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
  simpleDetail = false,
  fixedHeight = false,
  openAllStoresRequestKey,
}: Section1CardProps) {
  const [detailView, setDetailView] = useState<DetailView>('season');
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(null);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<SelectedCategoryDetail | null>(null);
  const [allStoresOpen, setAllStoresOpen] = useState(false);
  const [storeCountMatrixOpen, setStoreCountMatrixOpen] = useState(false);
  const prevOpenAllStoresRequestKeyRef = useRef(openAllStoresRequestKey ?? 0);

  useEffect(() => {
    const prevKey = prevOpenAllStoresRequestKeyRef.current;
    const nextKey = openAllStoresRequestKey ?? 0;

    if (nextKey > prevKey) {
      setAllStoresOpen(true);
    }

    prevOpenAllStoresRequestKeyRef.current = nextKey;
  }, [openAllStoresRequestKey]);

  const activeDetailView = detailViewMode ?? detailView;
  const setActiveDetailView = (view: DetailView) => {
    if (onDetailViewModeChange) {
      onDetailViewModeChange(view);
      return;
    }
    setDetailView(view);
  };
  const isTwRegion = region === 'TW';
  const salesLabel = language === 'ko' ? '실판매출' : 'Sales';
  const discountRateLabel = language === 'ko' ? t(language, 'discountRateLabel') : 'Disc.';
  const shortSameStoreLabel = language === 'ko' ? '동매장 YoY' : 'SS YoY';
  const projectedLabel = language === 'ko' ? '월말예상' : 'M-end Est.';
  const salesLabelTooltip = isTwRegion
    ? language === 'ko'
      ? 'TW 실판매출은 V+ 기준입니다.'
      : 'TW actual sales are based on V+.'
    : null;

  const formatCurrency = (num: number) => {
    const converted = region === 'TW' && currencyCode === 'TWD' ? num * hkdToTwdRate : num;
    const value = Number.isFinite(converted) ? converted : 0;
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toFixed(0);
  };

  const formatRate = (rate: number | null | undefined) =>
    typeof rate === 'number' && isFinite(rate) ? `${rate.toFixed(1)}%` : '-';

  const formatPercentPointDiff = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !isFinite(value)) return '-';
    if (value > 0) return `+${value.toFixed(1)}%p`;
    if (value < 0) return `\u25B3${Math.abs(value).toFixed(1)}%p`;
    return '0.0%p';
  };

  const formatStoreCount = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !isFinite(value)) return '-';
    const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    return language === 'ko' ? `${formatted}개` : `${formatted} stores`;
  };

  const getTrendLabel = (value: number | null) => {
    if (value === null) return '-';
    if (language === 'ko') return value >= 100 ? '↗ 성장' : '↘ 감소';
    return value >= 100 ? '↗ Up' : '↘ Down';
  };

  const countActiveStores = (stores: any[], metricKey: 'mtd_act' | 'mtd_act_py' | 'ytd_act' | 'ytd_act_py') =>
    stores.filter((store) => Number(store?.[metricKey] || 0) > 0).length;

  const emptyKpis = {
    k1: {
      label: salesLabel,
      value: '-',
      discountRate: '-',
      discountDiff: '-',
      projectedSales: '-',
      projectedYoy: '-',
      projectedYoyRaw: null,
      projectedTooltip:
        language === 'ko'
          ? '과거 동일 월 매출 기반 환산 로직을 불러오는 중입니다.'
          : 'Loading projection logic based on historical month sales.',
    } as KpiBlock,
    k2: { label: t(language, 'yoy'), value: '-' } as KpiBlock,
    k3: {
      label: t(language, 'progress'),
      value: '-',
      projectedLabel,
      projectedValue: '-',
      projectedTooltip:
        language === 'ko'
          ? '과거 동일 월 매출 기반 환산 로직을 불러오는 중입니다.'
          : 'Loading projection logic based on historical month sales.',
      projectedSummary: language === 'ko' ? '과거 동일 월 매출 기반 환산' : 'Historical same-month projection',
    } as KpiBlock,
  };

  const calculateKPIs = () => {
    if (!section1Data?.total_subtotal) return emptyKpis;

    const total = section1Data.total_subtotal;
    if (isYtdMode) {
      if (typeof total.ytd_act === 'undefined' || total.ytd_act === null) return emptyKpis;
    } else {
      if (typeof total.mtd_act === 'undefined' || total.mtd_act === null) return emptyKpis;
    }

    const actual = isYtdMode ? total.ytd_act : total.mtd_act;
    const compareRate = isYtdMode ? total.yoy_ytd : total.yoy;
    const progress = isYtdMode ? total.progress_ytd : total.progress;
    const projectedProgress = isYtdMode ? total.projected_progress_ytd : total.projected_progress;
    const discountRate = isYtdMode ? total.discount_rate_ytd : total.discount_rate_mtd;
    const discountRateDiff = isYtdMode ? total.discount_rate_ytd_diff : total.discount_rate_mtd_diff;
    const projectedSales = isYtdMode ? total.ytdMonthEndProjection : total.monthEndProjection;
    const projectedYoy = isYtdMode ? total.ytdProjectedYoY : total.projectedYoY;
    const sameStoreCompareRate = isYtdMode ? total.same_store_yoy_ytd : total.same_store_yoy;
    const currentActiveStoreCount = isYtdMode ? total.active_store_count_ytd_avg : total.active_store_count_mtd;
    const previousActiveStoreCount = isYtdMode ? total.active_store_count_ytd_avg_py : total.active_store_count_mtd_py;

    const projectionMeta = section1Data?.projection_meta;
    const forecastSource = total.forecast_source || section1Data?.forecast_source || null;
    const forecastMonths = Array.isArray(total.forecast_months)
      ? total.forecast_months
      : Array.isArray(section1Data?.forecast_months)
        ? section1Data.forecast_months
        : [];
    const forecastMonthSummary = forecastMonths.map((item: any) => item.month).join(', ');

    const hasCompareRate = typeof compareRate === 'number' && isFinite(compareRate);
    const hasDiscountRate = typeof discountRate === 'number' && !isNaN(discountRate);
    const hasSameStoreCompareRate = typeof sameStoreCompareRate === 'number' && isFinite(sameStoreCompareRate);
    const hasProjectedProgress = typeof projectedProgress === 'number' && isFinite(projectedProgress);
    const projectionYears = (projectionMeta?.trainingYears || []).join(', ');
    const offlineStores =
      region === 'TW'
        ? [...(section1Data?.tw_normal || []), ...(section1Data?.tw_outlet || [])]
        : [
            ...(section1Data?.hk_normal || []),
            ...(section1Data?.hk_outlet || []),
            ...(section1Data?.mc_normal || []),
            ...(section1Data?.mc_outlet || []),
          ];
    const onlineStores =
      region === 'TW'
        ? [...(section1Data?.tw_online || [])]
        : [...(section1Data?.hk_online || []), ...(section1Data?.mc_online || [])];
    const currentMetricKey = isYtdMode ? 'ytd_act' : 'mtd_act';
    const previousMetricKey = isYtdMode ? 'ytd_act_py' : 'mtd_act_py';
    const offlineStoreCountFlow =
      language === 'ko'
        ? `오프라인 ${countActiveStores(offlineStores, previousMetricKey)}개 → ${countActiveStores(offlineStores, currentMetricKey)}개`
        : `Offline ${countActiveStores(offlineStores, previousMetricKey)} -> ${countActiveStores(offlineStores, currentMetricKey)}`;
    const onlineStoreCountFlow =
      language === 'ko'
        ? `온라인 ${countActiveStores(onlineStores, previousMetricKey)}개 → ${countActiveStores(onlineStores, currentMetricKey)}개`
        : `Online ${countActiveStores(onlineStores, previousMetricKey)} -> ${countActiveStores(onlineStores, currentMetricKey)}`;

    return {
      k1: {
        label: salesLabel,
        value: formatCurrency(actual),
        discountRate: hasDiscountRate ? formatRate(discountRate) : '-',
        discountDiff: formatPercentPointDiff(discountRateDiff),
        projectedSales:
          typeof projectedSales === 'number' && isFinite(projectedSales)
            ? formatCurrency(projectedSales)
            : '-',
        projectedYoy:
          typeof projectedYoy === 'number' && isFinite(projectedYoy)
            ? `${projectedYoy.toFixed(0)}%`
            : '-',
        projectedYoyRaw:
          typeof projectedYoy === 'number' && isFinite(projectedYoy) ? projectedYoy : null,
        projectedTooltip:
          isYtdMode
            ? (
              language === 'ko'
                ? `누적 환산은 전월까지의 누적 실적에 당월 월말환산 매출을 더한 값입니다. 기준월: ${section1Data?.base_month || date.slice(0, 7)}`
                : `YTD projection is calculated as actuals through the previous month plus the projected month-end sales for the current month. Base month: ${section1Data?.base_month || date.slice(0, 7)}`
            )
            : (
              language === 'ko'
                ? `${projectionMeta?.explanation || '과거 2개년 동일 월 일별 매출을 기준으로 요일, 월중 구간, 춘절 영향을 반영해 월말 매출과 환산 YoY를 계산합니다.'}${projectionYears ? ` 학습연도: ${projectionYears}` : ''}`
                : `Month-end projection and projected YoY are based on same-month daily actual sales from the prior two years, adjusted for weekday, intra-month pattern, and Lunar New Year effects.${projectionYears ? ` Training years: ${projectionYears}` : ''}`
            ),
        rawDiscountDiff: typeof discountRateDiff === 'number' && isFinite(discountRateDiff) ? discountRateDiff : null,
      } as KpiBlock & { rawDiscountDiff: number | null },
      k2: {
        label: t(language, 'yoy'),
        value: hasCompareRate ? `${compareRate.toFixed(0)}%` : '-',
        rawValue: hasCompareRate ? compareRate : null,
        overallTooltip:
          language === 'ko'
            ? `전체 YoY는 전년 동일기간 활성매장 매출 대비 올해 활성매장 전체 매출 기준. 활성매장 수는 ${formatStoreCount(previousActiveStoreCount)} → ${formatStoreCount(currentActiveStoreCount)}.`
            : `Overall YoY compares current active-store sales against sales from active stores in the same period last year. Active store count is ${formatStoreCount(previousActiveStoreCount)} -> ${formatStoreCount(currentActiveStoreCount)}.`,
        sameStoreLabel: shortSameStoreLabel,
        sameStoreValue: hasSameStoreCompareRate ? `${sameStoreCompareRate.toFixed(0)}%` : '-',
        sameStoreRawValue: hasSameStoreCompareRate ? sameStoreCompareRate : null,
        sameStoreTooltip:
          language === 'ko'
            ? `동매장 YoY는 전년/당년 동일기간 모두 매출이 있는 매장만 포함합니다. 오프라인 매장은 당월 0매출일이 5일 이상이면 당년 산식에서 제외합니다.`
            : `Same-store YoY includes only stores with sales in both periods. Offline stores with 5+ zero-sales days in the current month are excluded from the current-year side.`,
        storeCountFlow:
          language === 'ko'
            ? `매장수: 전년 ${formatStoreCount(previousActiveStoreCount)} → 당년 ${formatStoreCount(currentActiveStoreCount)}`
            : `${formatStoreCount(previousActiveStoreCount)} -> ${formatStoreCount(currentActiveStoreCount)}`,
        offlineStoreCountFlow,
        onlineStoreCountFlow,
        sameStoreTrendLabel: getTrendLabel(hasSameStoreCompareRate ? sameStoreCompareRate : null),
      } as KpiBlock & { rawValue: number | null },
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
        rawValue: typeof progress === 'number' && isFinite(progress) ? progress : null,
        projectedLabel,
        projectedValue: hasProjectedProgress ? `${projectedProgress.toFixed(1)}%` : '-',
        projectedTooltip:
          isYtdMode
            ? (
              language === 'ko'
                ? `누적 월말환산은 전월까지 actual + 당월 월말환산 기준입니다.`
                : `YTD projected progress uses actuals through the previous month plus the current month's month-end projection.`
            )
            : (
              language === 'ko'
                ? `${projectionMeta?.explanation || '과거 2개년 동일 월 일별 매출을 기준으로 요일, 월중 구간, 춘절 영향을 반영해 월말 매출을 환산하고 목표 대비 진척률로 계산합니다.'}${projectionYears ? ` 학습연도: ${projectionYears}` : ''}`
                : `Month-end projection is based on same-month daily actual sales from the prior two years, adjusted for weekday, intra-month pattern, and Lunar New Year effects.${projectionYears ? ` Training years: ${projectionYears}` : ''}`
            ),
        projectedSummary:
          isYtdMode
            ? (language === 'ko' ? '전월 actual + 당월 월말환산' : 'Prev-month actual + current month-end projection')
            : (language === 'ko'
                ? projectionMeta?.methodSummary || '과거 2개년 동일 월 패턴 + 요일 + 춘절 보정'
                : 'Prior 2 years month pattern + weekday + Lunar New Year'),
      } as KpiBlock & { rawValue: number | null },
    };
  };

  const kpis = calculateKPIs();
  const modeBadgeLabel =
    language === 'ko'
      ? isYtdMode
        ? '누적'
        : '당월'
      : isYtdMode
        ? 'YTD'
        : 'MTD';
  const targetModeBadgeLabel =
    language === 'ko'
      ? isYtdMode
        ? '누적\n목표대비'
        : '당월\n목표대비'
      : isYtdMode
        ? 'YTD\nvs Tgt'
        : 'MTD\nvs Tgt';
  const modePeriodLabel = isYtdMode
    ? `${date.slice(0, 4)}/01/01~${date.slice(5).replace('-', '/')}`
    : `${date.slice(0, 4)}/${date.slice(5, 7)}/01~${date.slice(5).replace('-', '/')}`;

  const getYoyColor = (yoy: number | null) => {
    if (yoy === null) return 'text-gray-600 bg-gray-100';
    if (yoy >= 100) return 'text-green-700 bg-green-50 border-green-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getDiscountDiffColor = (diff: number | null) => {
    if (diff === null) return 'text-gray-600';
    if (diff > 0) return 'text-red-600';
    if (diff < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const getYoyTextColor = (yoy: number | null) => {
    if (yoy === null) return 'text-gray-600';
    if (yoy >= 100) return 'text-green-700';
    return 'text-red-700';
  };

  const getYoyCardTone = (yoy: number | null) => {
    if (yoy === null) return 'border-gray-200 bg-gradient-to-br from-gray-50 to-white hover:border-purple-200 hover:bg-purple-50/40';
    if (yoy >= 100) return 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-300 hover:bg-emerald-50';
    return 'border-rose-200 bg-gradient-to-br from-rose-50 to-white hover:border-rose-300 hover:bg-rose-50';
  };

  const titleBadgeClass =
    'inline-flex max-w-full items-center rounded-md bg-white/85 px-2 py-0.5 text-[11px] font-medium leading-tight whitespace-normal break-words text-gray-600 ring-1 ring-inset ring-gray-200';

  const currencyUnit =
    region === 'TW'
      ? language === 'ko'
        ? `단위: ${currencyCode}`
        : `Unit: ${currencyCode}`
      : t(language, 'cardUnit');
  const seasonCategorySales = section1Data?.season_category_sales;
  const seasonLabels = seasonCategorySales?.season_labels || {};

  const storeMetricCards = useMemo<StoreMetricCard[]>(() => {
    if (!section1Data || typeof section1Data !== 'object') return [];

    const rawStores = Object.entries(section1Data)
      .filter(([key, value]) => Array.isArray(value) && !key.endsWith('_subtotal'))
      .flatMap(([, value]) => value as any[])
      .filter((store) => store && typeof store === 'object')
      .filter((store) => (store.channel || '') !== '온라인');

    const dedupedByCode = new Map<string, any>();
    rawStores.forEach((store) => {
      const code = String(store.shop_cd || store.shop_name || '');
      if (!code) return;
      if (!dedupedByCode.has(code)) dedupedByCode.set(code, store);
    });

    const cards = [...dedupedByCode.values()].map((store) => {
      const sales = isYtdMode ? Number(store.ytd_act || 0) : Number(store.mtd_act || 0);
      const prevSales = isYtdMode ? Number(store.ytd_act_py || 0) : Number(store.mtd_act_py || 0);
      const yoyRaw = isYtdMode ? store.yoy_ytd : store.yoy;
      const discountRateRaw = isYtdMode ? store.discount_rate_ytd : store.discount_rate_mtd;
      const discountDiffRaw = isYtdMode ? store.discount_rate_ytd_diff : store.discount_rate_mtd_diff;

      const storeCode = String(store.shop_cd || '');
      const fullName = String(store.shop_name || store.shop_cd || '-');
      const asofDate = date ? new Date(date) : undefined;
      const area = storeCode ? getStoreArea(storeCode, asofDate) : null;

      return {
        key: String(store.shop_cd || store.shop_name || ''),
        title: String(store.shop_name || store.shop_cd || '-'),
        storeCode,
        fullName,
        area,
        sales,
        prevSales,
        yoy: typeof yoyRaw === 'number' && isFinite(yoyRaw) ? yoyRaw : null,
        discountRate: typeof discountRateRaw === 'number' && isFinite(discountRateRaw) ? discountRateRaw : null,
        discountDiff: typeof discountDiffRaw === 'number' && isFinite(discountDiffRaw) ? discountDiffRaw : null,
      };
    });

    cards.sort((a, b) => b.sales - a.sales);
    return cards;
  }, [section1Data, isYtdMode]);

  const storeCountMatrixItems = useMemo(() => {
    if (!section1Data || typeof section1Data !== 'object') {
      return {
        previous: [] as StoreCountMatrixItem[],
        current: [] as StoreCountMatrixItem[],
        sameStore: [] as StoreCountMatrixItem[],
      };
    }

    const rawStores = Object.entries(section1Data)
      .filter(([key, value]) => Array.isArray(value) && !key.endsWith('_subtotal'))
      .flatMap(([, value]) => value as any[])
      .filter((store) => store && typeof store === 'object');

    const dedupedByCode = new Map<string, any>();
    rawStores.forEach((store) => {
      const code = String(store.shop_cd || '').trim();
      if (!code || code.includes('_TOTAL')) return;
      if (!dedupedByCode.has(code)) dedupedByCode.set(code, store);
    });

    const stores = [...dedupedByCode.values()];
    const currentMetricKey = isYtdMode ? 'ytd_act' : 'mtd_act';
    const previousMetricKey = isYtdMode ? 'ytd_act_py' : 'mtd_act_py';

    const isOfflineStore = (store: any) => (store?.channel || '') !== '온라인';
    const isExcludedByZeroSalesRule = (store: any) =>
      !isYtdMode &&
      isOfflineStore(store) &&
      typeof store?.mtd_zero_sales_days === 'number' &&
      store.mtd_zero_sales_days >= 5;

    const toMatrixItem = (store: any): StoreCountMatrixItem => ({
      shopCd: String(store.shop_cd || ''),
      shopName: String(store.shop_name || store.shop_cd || ''),
      channel: String(store.channel || ''),
      currentSales: Number(store?.[currentMetricKey] || 0),
      previousSales: Number(store?.[previousMetricKey] || 0),
      yoy: typeof (isYtdMode ? store?.yoy_ytd : store?.yoy) === 'number' && isFinite(isYtdMode ? store?.yoy_ytd : store?.yoy)
        ? Number(isYtdMode ? store.yoy_ytd : store.yoy)
        : null,
      discountRate:
        typeof (isYtdMode ? store?.discount_rate_ytd : store?.discount_rate_mtd) === 'number' &&
        isFinite(isYtdMode ? store?.discount_rate_ytd : store?.discount_rate_mtd)
          ? Number(isYtdMode ? store.discount_rate_ytd : store.discount_rate_mtd)
          : null,
      discountDiff:
        typeof (isYtdMode ? store?.discount_rate_ytd_diff : store?.discount_rate_mtd_diff) === 'number' &&
        isFinite(isYtdMode ? store?.discount_rate_ytd_diff : store?.discount_rate_mtd_diff)
          ? Number(isYtdMode ? store.discount_rate_ytd_diff : store.discount_rate_mtd_diff)
          : null,
    });

    const previous = stores
      .filter((store) => Number(store?.[previousMetricKey] || 0) > 0)
      .map(toMatrixItem)
      .sort((a, b) => a.shopCd.localeCompare(b.shopCd));

    const current = stores
      .filter((store) => Number(store?.[currentMetricKey] || 0) > 0 && !isExcludedByZeroSalesRule(store))
      .map(toMatrixItem)
      .sort((a, b) => a.shopCd.localeCompare(b.shopCd));

    const sameStore = stores
      .filter(
        (store) =>
          Number(store?.[currentMetricKey] || 0) > 0 &&
          Number(store?.[previousMetricKey] || 0) > 0 &&
          !isExcludedByZeroSalesRule(store)
      )
      .map(toMatrixItem)
      .sort((a, b) => a.shopCd.localeCompare(b.shopCd));

    return { previous, current, sameStore };
  }, [section1Data, isYtdMode]);

  const allStoreTreemapItems = useMemo<Section1AllStoresTreemapItem[]>(() => {
    if (!section1Data || typeof section1Data !== 'object') return [];

    const rawStores = Object.entries(section1Data)
      .filter(([key, value]) => Array.isArray(value) && !key.endsWith('_subtotal'))
      .flatMap(([, value]) => value as any[])
      .filter((store) => store && typeof store === 'object');

    const dedupedByCode = new Map<string, any>();
    rawStores.forEach((store) => {
      const code = String(store.shop_cd || store.shop_name || '');
      if (!code) return;
      if (!dedupedByCode.has(code)) dedupedByCode.set(code, store);
    });

    const mappedItems = [...dedupedByCode.values()].map((store) => {
        const fullName = String(store.shop_name || store.shop_cd || '-');
        return {
          storeCode: String(store.shop_cd || ''),
          storeName: fullName,
          shortName: getTreemapStoreShortName(store),
          channel: typeof store.channel === 'string' ? store.channel : undefined,
          mtdTagSales: Number(store.mtd_tag || 0),
          mtdSales: Number(store.mtd_act || 0),
          mtdPrevSales: Number(store.mtd_act_py || 0),
          ytdTagSales: Number(store.ytd_tag || 0),
          ytdSales: Number(store.ytd_act || 0),
          ytdPrevSales: Number(store.ytd_act_py || 0),
          mtdYoy: typeof store.yoy === 'number' && isFinite(store.yoy) ? store.yoy : null,
          ytdYoy: typeof store.yoy_ytd === 'number' && isFinite(store.yoy_ytd) ? store.yoy_ytd : null,
          mtdDiscountRate:
            typeof store.discount_rate_mtd === 'number' && isFinite(store.discount_rate_mtd) ? store.discount_rate_mtd : null,
          ytdDiscountRate:
            typeof store.discount_rate_ytd === 'number' && isFinite(store.discount_rate_ytd) ? store.discount_rate_ytd : null,
          mtdDiscountRateDiff:
            typeof store.discount_rate_mtd_diff === 'number' && isFinite(store.discount_rate_mtd_diff)
              ? store.discount_rate_mtd_diff
              : null,
          ytdDiscountRateDiff:
            typeof store.discount_rate_ytd_diff === 'number' && isFinite(store.discount_rate_ytd_diff)
              ? store.discount_rate_ytd_diff
              : null,
        };
      });

    const shortNameCounts = mappedItems.reduce((acc, item) => {
      acc.set(item.shortName, (acc.get(item.shortName) || 0) + 1);
      return acc;
    }, new Map<string, number>());

    return mappedItems
      .map((item) => ({
        ...item,
        shortName:
          (shortNameCounts.get(item.shortName) || 0) > 1
            ? item.storeCode || item.shortName
            : item.shortName,
      }))
      .sort((a, b) => (isYtdMode ? b.ytdSales - a.ytdSales : b.mtdSales - a.mtdSales));
  }, [section1Data, isYtdMode]);

  const top5StoreCards = storeMetricCards.slice(0, 5);
  const worst5StoreCards = storeMetricCards
    .filter((item) => {
      const isClosed = item.prevSales > 0 && item.sales <= 0;
      return item.sales > 0 && !isClosed;
    })
    .slice(-5)
    .sort((a, b) => b.sales - a.sales);
  const detailTopStoreCards = storeMetricCards.slice(0, 4);
  const detailBottomStoreCards = [...storeMetricCards]
    .filter((item) => item.sales > 0)
    .slice(-4)
    .sort((a, b) => a.sales - b.sales);
  const detailStoreCards = [...detailTopStoreCards, ...detailBottomStoreCards];
  const openStoreDetail = (storeCode: string, storeName: string) => {
    if (!storeCode) return;
    setSelectedStore({ shopCd: storeCode, storeName });
  };

  const openCategoryDetail = (key: Section1CategoryDetailKey, title: string) => {
    setSelectedCategoryDetail({ key, title });
  };

  const hasNextSeasonSales =
    showSeasonCategory && seasonCategorySales?.metrics
      ? (() => {
          const nextMetric = seasonCategorySales.metrics.nextSeason;
          const nextSales = isYtdMode ? nextMetric?.ytd_act : nextMetric?.mtd_act;
          return typeof nextSales === 'number' && nextSales > 0;
        })()
      : false;

  const detailMetrics =
    showSeasonCategory && seasonCategorySales?.metrics
      ? [
          { key: 'currentSeason', title: `${language === 'ko' ? t(language, 'currentSeason') : 'Current'}(${seasonLabels.current || '-'})`, apparelOnly: true },
          ...(hasNextSeasonSales
            ? [{ key: 'nextSeason', title: `${language === 'ko' ? t(language, 'nextSeason') : 'Next'}(${seasonLabels.next || '-'})`, apparelOnly: true } as const]
            : []),
          { key: 'pastSeason', title: `${language === 'ko' ? t(language, 'pastSeason') : 'Old'}(${seasonLabels.past || '-'})`, apparelOnly: true },
          { key: 'hat', title: language === 'ko' ? t(language, 'hat') : 'Hats' },
          { key: 'shoes', title: t(language, 'shoes') },
          ...(!hasNextSeasonSales ? [{ key: 'bag', title: language === 'ko' ? t(language, 'bag') : 'Bags' } as const] : []),
        ]
      : [];

  const detailCards =
    activeDetailView === 'season'
      ? detailMetrics.map((item) => {
          const metric = seasonCategorySales.metrics[item.key];
          return {
            key: String(item.key),
            title: item.title,
            apparelOnly: item.apparelOnly,
            sales: isYtdMode ? metric?.ytd_act : metric?.mtd_act,
            yoy: isYtdMode ? metric?.ytd_yoy : metric?.mtd_yoy,
            discountRate: isYtdMode ? metric?.ytd_discount_rate : metric?.mtd_discount_rate,
            discountDiff: isYtdMode ? metric?.ytd_discount_rate_diff : metric?.mtd_discount_rate_diff,
          };
        })
      : (activeDetailView === 'top5' ? top5StoreCards : worst5StoreCards).map((item) => ({
          ...item,
          apparelOnly: false,
        }));
  const seasonCardTitleMinHeightClass = language === 'ko' ? 'min-h-[60px]' : 'min-h-[30px]';

  return (
    <article className={`${fixedHeight ? 'h-[468px]' : ''} rounded-2xl border border-gray-100 border-l-4 border-l-purple-500 bg-white p-4 pb-5 shadow-sm sm:p-5 sm:pb-6`}>
      <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="leading-tight text-base font-semibold text-gray-900">{t(language, 'section1Title')}</h3>
            {onYtdModeToggle && (
              <div className="flex items-center gap-1.5 rounded-lg bg-purple-50 px-2 py-1">
                <svg className="h-3.5 w-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-[11px] font-medium leading-none text-purple-900 sm:text-xs">
                  {isYtdMode
                    ? `${date.slice(0, 4)}/01/01~${date.slice(5).replace('-', '/')}`
                    : `${date.slice(0, 4)}/${date.slice(5, 7)}/01~${date.slice(5).replace('-', '/')}`}
                </p>
              </div>
            )}
            {showSeasonCategory && (
              <div className="inline-flex min-h-[46px] overflow-hidden rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setActiveDetailView('season')}
                  className={`flex min-h-[46px] items-center justify-center px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    activeDetailView === 'season'
                      ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? '시즌' : 'Season'}
                </button>
                <button
                  onClick={() => setActiveDetailView('top5')}
                  className={`flex min-h-[46px] items-center justify-center border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    activeDetailView === 'top5'
                      ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? (
                    <span className="inline-block leading-tight">상위<br />매장</span>
                  ) : (
                    'Top'
                  )}
                </button>
                <button
                  onClick={() => setActiveDetailView('worst5')}
                  className={`flex min-h-[46px] items-center justify-center border-l border-gray-200 px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    activeDetailView === 'worst5'
                      ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'ko' ? (
                    <span className="inline-block leading-tight">하위<br />매장</span>
                  ) : (
                    'Bottom'
                  )}
                </button>
              </div>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t(language, 'section1Subtitle')}</p>
          {!simpleDetail && <p className="mt-1 text-[11px] text-gray-500">{currencyUnit}</p>}
        </div>

        {onYtdModeToggle && (
          <div className="w-full shrink-0 sm:w-auto">
            <div className="inline-flex min-h-[46px] overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => {
                  if (isYtdMode) onYtdModeToggle();
                }}
                className={`flex min-h-[46px] items-center justify-center px-2 py-2 text-xs font-medium transition-colors sm:px-3 ${
                  !isYtdMode
                    ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'mtdToggle')}
              </button>
              <button
                onClick={() => {
                  if (!isYtdMode) onYtdModeToggle();
                }}
                className={`flex min-h-[46px] items-center justify-center border-l border-gray-200 px-2 py-2 text-xs font-medium transition-colors sm:px-3 ${
                  isYtdMode
                    ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(language, 'ytdToggle')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {simpleDetail ? (
          <>
            <div className="relative rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 p-3 pt-5 sm:min-h-[116px]">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <span className="inline-flex rounded-lg bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100 shadow-sm">
                  {modeBadgeLabel}
                </span>
              </div>
              <p className={`${titleBadgeClass} min-h-[20px]`}>{kpis.k1.label}</p>
              <p className="mt-3 text-2xl font-bold leading-tight tabular-nums text-gray-900">{kpis.k1.value}</p>
            </div>
            <div className="relative rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 pt-5 sm:min-h-[116px]">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <span className="inline-flex rounded-lg bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100 shadow-sm">
                  {modeBadgeLabel}
                </span>
              </div>
              <p className={`${titleBadgeClass} min-h-[20px]`}>{kpis.k2.label}</p>
              <p className="mt-3 text-2xl font-bold leading-tight tabular-nums text-gray-900">{kpis.k2.value}</p>
            </div>
            <div className="relative rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 pt-5 sm:min-h-[116px]">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <span className="inline-flex whitespace-pre-line rounded-lg bg-emerald-50 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight text-emerald-700 ring-1 ring-emerald-100 shadow-sm">
                  {targetModeBadgeLabel}
                </span>
              </div>
              <p className={`${titleBadgeClass} min-h-[20px]`}>{kpis.k3.label}</p>
              <p className="mt-3 text-2xl font-bold leading-tight tabular-nums text-gray-900">{kpis.k3.value}</p>
            </div>
          </>
        ) : (
          <>
        <div className="relative grid min-w-0 grid-rows-[auto_1fr_auto] rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 p-2.5 pt-5 sm:min-h-[132px] sm:p-3 sm:pt-5">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <span className="inline-flex rounded-lg bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100 shadow-sm">
              {modeBadgeLabel}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_0.9fr] gap-2.5">
            <div className="min-h-[24px] min-w-0 border-r border-blue-100 pr-2.5">
              {salesLabelTooltip ? (
                <div className="group relative inline-block">
                  <p className={`${titleBadgeClass} cursor-help underline decoration-dotted underline-offset-2`}>
                    {kpis.k1.label}
                  </p>
                  <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-40 rounded bg-gray-900 px-2 py-1.5 text-[10px] leading-relaxed text-white shadow-md group-hover:block">
                    {salesLabelTooltip}
                  </div>
                </div>
              ) : (
                <p className={titleBadgeClass}>{kpis.k1.label}</p>
              )}
            </div>
            <div className="min-h-[24px] min-w-0">
              <p className={titleBadgeClass}>{discountRateLabel}</p>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_0.9fr] items-center gap-2.5">
            <div className="min-w-0 border-r border-blue-100 pr-2.5">
              <p className="text-lg font-bold leading-tight tabular-nums text-gray-900 sm:text-xl">{kpis.k1.value}</p>
            </div>
            <div className="min-w-0">
              <p className="discount-rate-emphasis text-lg leading-tight tabular-nums sm:text-xl">{kpis.k1.discountRate}</p>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_0.9fr] items-start gap-2.5">
            <div className="grid min-w-0 grid-rows-[16px_auto] border-r border-blue-100 pr-2.5">
              <div className="group relative block h-4">
                <p className="cursor-help text-[10px] font-medium leading-none text-gray-500 underline decoration-dotted underline-offset-2">
                  {language === 'ko' ? '월말환산' : 'Projection'}
                </p>
                <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 rounded bg-gray-900 px-2 py-1.5 text-[10px] leading-relaxed text-white shadow-md group-hover:block">
                  {(kpis.k1 as any).projectedTooltip}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight tabular-nums text-gray-700">
                  {(kpis.k1 as any).projectedSales}
                </p>
                <p
                  className={`text-sm font-semibold leading-tight tabular-nums ${getYoyTextColor(
                    (kpis.k1 as any).projectedYoyRaw ?? null
                  )}`}
                >
                  <span>
                    ({(kpis.k1 as any).projectedYoy})
                  </span>
                </p>
              </div>
            </div>
            <div className="grid min-w-0 grid-rows-[16px_auto] self-start">
              <div className="block h-4">
                <p className="text-[10px] font-medium leading-none text-gray-500">{language === 'ko' ? '전년비' : 'vs LY'}</p>
              </div>
              <p className={`text-sm font-semibold leading-tight tabular-nums ${getDiscountDiffColor((kpis.k1 as any).rawDiscountDiff)}`}>
                {kpis.k1.discountDiff}
              </p>
            </div>
          </div>
        </div>
        <div className="relative grid min-w-0 grid-rows-[auto_1fr_auto] rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2.5 pt-5 sm:min-h-[132px] sm:p-3 sm:pt-5">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100 shadow-sm">
              {modeBadgeLabel}
            </span>
          </div>
          <div className="grid grid-cols-[0.92fr_1.08fr] gap-2.5">
            <div className="min-h-[24px] min-w-0 border-r border-gray-200 pr-2.5">
              <div className="group relative inline-block">
                <p className={`${titleBadgeClass} cursor-help underline decoration-dotted underline-offset-2`}>
                  {kpis.k2.label}
                </p>
                <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-52 rounded bg-gray-900 px-2 py-1.5 text-[10px] leading-relaxed text-white shadow-md group-hover:block">
                  {(kpis.k2 as any).overallTooltip}
                </div>
              </div>
            </div>
            <div className="min-h-[24px] min-w-0">
              <div className="group relative inline-block">
                <p className={`${titleBadgeClass} cursor-help underline decoration-dotted underline-offset-2`}>
                  {(kpis.k2 as any).sameStoreLabel}
                </p>
                <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden w-52 rounded bg-gray-900 px-2 py-1.5 text-[10px] leading-relaxed text-white shadow-md group-hover:block">
                  {(kpis.k2 as any).sameStoreTooltip}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[0.92fr_1.08fr] items-center gap-2.5">
            <div className="min-w-0 border-r border-gray-200 pr-2.5">
              <p className={`text-lg font-bold leading-tight tabular-nums sm:text-xl ${getYoyTextColor((kpis.k2 as any).rawValue)}`}>
                {kpis.k2.value}
              </p>
            </div>
            <div className="min-w-0">
              <p className={`text-lg font-bold leading-tight tabular-nums sm:text-xl ${getYoyTextColor((kpis.k2 as any).sameStoreRawValue)}`}>
                {(kpis.k2 as any).sameStoreValue}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[0.92fr_1.08fr] gap-2.5">
            <div className="min-w-0 border-r border-gray-200 pr-2.5">
              <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getYoyColor((kpis.k2 as any).rawValue)}`}>
                {getTrendLabel((kpis.k2 as any).rawValue)}
              </span>
            </div>
            <div className="min-w-0">
              <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getYoyColor((kpis.k2 as any).sameStoreRawValue)}`}>
                {(kpis.k2 as any).sameStoreTrendLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="relative grid min-w-0 grid-rows-[auto_1fr_auto] rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2.5 pt-5 sm:min-h-[132px] sm:p-3 sm:pt-5">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <span className="inline-flex whitespace-pre-line rounded-lg bg-emerald-50 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight text-emerald-700 ring-1 ring-emerald-100 shadow-sm">
              {targetModeBadgeLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-h-[24px] min-w-0 border-r border-gray-200 pr-2.5">
              <div className="group relative inline-block">
                <p className={`${titleBadgeClass} cursor-help underline decoration-dotted underline-offset-2`}>
                  {kpis.k3.label}
                </p>
                <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max rounded bg-gray-900 px-2 py-1 text-[10px] text-white shadow-md group-hover:block">
                  {t(language, 'progressVsApproved')}
                </div>
              </div>
            </div>
            <div className="min-h-[24px] min-w-0">
              <div className="group relative inline-block">
                <p className={`${titleBadgeClass} cursor-help underline decoration-dotted underline-offset-2`}>
                  {(kpis.k3 as any).projectedLabel}
                </p>
                <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden w-56 rounded bg-gray-900 px-2 py-1.5 text-[10px] leading-relaxed text-white shadow-md group-hover:block">
                  {(kpis.k3 as any).projectedTooltip}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 items-center gap-2.5">
            <div className="min-w-0 border-r border-gray-200 pr-2.5">
              <p className="text-base font-bold leading-tight tabular-nums text-gray-900 sm:text-lg">{kpis.k3.value}</p>
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight tabular-nums text-gray-900 sm:text-lg">{(kpis.k3 as any).projectedValue}</p>
            </div>
          </div>
          <div />
        </div>
          </>
        )}
      </div>

      {simpleDetail && detailStoreCards.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {detailStoreCards.map((item, index) => {
              const yoyColor =
                item.yoy !== null && typeof item.yoy === 'number' && isFinite(item.yoy)
                  ? item.yoy >= 100
                    ? 'text-green-700'
                    : 'text-red-700'
                  : 'text-gray-700';
              const storeFullName = String(item.fullName || item.title);
              const shortCode = getStoreShortCode(storeFullName) || item.title;
              const groupLabel =
                index < detailTopStoreCards.length
                  ? language === 'ko'
                    ? `상위 ${index + 1}`
                    : `Top ${index + 1}`
                  : language === 'ko'
                    ? `하위 ${index - detailTopStoreCards.length + 1}`
                    : `Bottom ${index - detailTopStoreCards.length + 1}`;

              return (
                <button
                  type="button"
                  key={`${groupLabel}-${item.key}`}
                  onClick={() => openStoreDetail(item.storeCode, storeFullName)}
                  className="rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-purple-200 hover:bg-purple-50/40"
                >
                  <p className="text-[10px] font-semibold tracking-[0.08em] text-gray-400">{groupLabel}</p>
                  <p className="mt-1 truncate text-[13px] font-bold leading-tight text-gray-800" title={storeFullName}>
                    {shortCode}
                  </p>
                  <p className="mt-2 text-[15px] font-bold leading-tight tabular-nums text-gray-900">{formatCurrency(item.sales || 0)}</p>
                  <p className={`mt-1 text-[11px] font-medium tabular-nums ${yoyColor}`}>
                    {typeof item.yoy === 'number' && isFinite(item.yoy) ? `YoY ${item.yoy.toFixed(0)}%` : 'YoY -'}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-start">
            <p className="inline-flex rounded-lg bg-purple-50 px-2 py-0.5 text-[9px] font-medium leading-tight text-purple-700 ring-1 ring-purple-100">
              {language === 'ko' ? '매장 카드를 클릭하면 판매 구성 상세가 열립니다.' : 'Click a store card to open the sales mix detail.'}
            </p>
          </div>
        </div>
      )}

      {!simpleDetail && detailCards.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center justify-start gap-2">
            <p className="inline-flex rounded-lg bg-purple-50 px-2 py-0.5 text-[10px] font-medium leading-tight text-purple-700 ring-1 ring-purple-100">
              {language === 'ko' ? '아래 카드를 누르면 상세 내역이 열립니다.' : 'Tap the cards below to open detail.'}
            </p>
            <span className="inline-flex rounded-lg bg-violet-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-violet-700 ring-1 ring-violet-100">
              {modeBadgeLabel}
            </span>
            <span className="text-[10px] font-medium leading-tight text-gray-500">
              {modePeriodLabel}
            </span>
          </div>
          <div className="grid w-full min-w-0 grid-cols-5 gap-1.5">
            {detailCards.map((item) => {
              const yoyColor =
                item.yoy !== null && typeof item.yoy === 'number' && isFinite(item.yoy)
                  ? item.yoy >= 100
                    ? 'text-green-700'
                    : 'text-red-700'
                  : 'text-gray-700';
              const discountDiffColor =
                item.discountDiff !== null && typeof item.discountDiff === 'number' && isFinite(item.discountDiff)
                  ? item.discountDiff > 0
                    ? 'text-red-600'
                    : item.discountDiff < 0
                      ? 'text-green-600'
                      : 'text-gray-600'
                  : 'text-gray-600';

              // 매장 카드인지 시즌 카드인지 확인
              const isStoreCard = activeDetailView !== 'season';
              const storeFullName = isStoreCard ? String((item as any).fullName || item.title) : '';
              const shortCode = isStoreCard ? getStoreShortCode(storeFullName) : null;
              const storeArea = isStoreCard ? ((item as any).area as number | null | undefined) ?? null : null;

              return isStoreCard ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openStoreDetail((item as any).storeCode || '', storeFullName || item.title)}
                  className={`group min-w-0 rounded-lg border p-2.5 text-left shadow-sm transition-colors ${getYoyCardTone(item.yoy)}`}
                >
                  <div className="relative min-h-[52px]">
                    <p className="break-keep text-sm font-bold leading-snug text-gray-800">{shortCode || item.title}</p>
                    <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max rounded bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                      <p className="font-semibold">{storeFullName || item.title}</p>
                      <p className="mt-1 text-gray-300">
                        {storeArea !== null ? `${storeArea}평` : language === 'ko' ? '면적 정보 없음' : 'No area data'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-[1.2rem] font-bold leading-tight tabular-nums text-gray-900 xl:text-[1.3rem]">{formatCurrency(item.sales || 0)}</p>
                  <p className={`mt-0.5 text-xs font-semibold tabular-nums ${yoyColor}`}>
                    {typeof item.yoy === 'number' && isFinite(item.yoy) ? `YoY ${item.yoy.toFixed(0)}%` : '-'}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums">
                    <span className="text-gray-600">
                      {t(language, 'discountRateLabel')}{' '}
                      <span className="discount-rate-emphasis">{formatRate(item.discountRate)}</span>
                    </span>{' '}
                    <span className={`font-semibold ${discountDiffColor}`}>({formatPercentPointDiff(item.discountDiff)})</span>
                  </p>
                </button>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openCategoryDetail(item.key as Section1CategoryDetailKey, item.title)}
                  className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border p-2.5 text-left shadow-sm transition-colors ${getYoyCardTone(item.yoy)}`}
                >
                  {item.apparelOnly ? (
                    <div className={`group relative flex items-start ${seasonCardTitleMinHeightClass}`}>
                      <p className="cursor-help break-keep text-sm font-bold leading-snug text-gray-800 underline decoration-dotted underline-offset-2">
                        {item.title}
                      </p>
                      <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-md group-hover:block">
                        {t(language, 'apparelOnly')}
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-start ${seasonCardTitleMinHeightClass}`}>
                      <p className="break-keep text-sm font-bold leading-snug text-gray-800">{item.title}</p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[1.2rem] font-bold leading-tight tabular-nums text-gray-900 xl:text-[1.3rem]">
                      {formatCurrency(item.sales || 0)}
                    </p>
                    <p className={`mt-1 text-xs font-semibold leading-tight tabular-nums ${yoyColor}`}>
                      {typeof item.yoy === 'number' && isFinite(item.yoy) ? `YoY ${item.yoy.toFixed(0)}%` : '-'}
                    </p>
                    <p className="mt-1 text-xs leading-tight tabular-nums">
                      <span className="text-gray-600">
                        {t(language, 'discountRateLabel')}{' '}
                        <span className="discount-rate-emphasis">{formatRate(item.discountRate)}</span>
                      </span>{' '}
                      <span className={`font-semibold ${discountDiffColor}`}>({formatPercentPointDiff(item.discountDiff)})</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {fixedHeight ? <div className="h-3" aria-hidden="true" /> : null}
        </div>
      )}

      <Section1StoreDetailModal
        open={!!selectedStore}
        onClose={() => setSelectedStore(null)}
        onOpenAllStores={() => {
          setSelectedStore(null);
          setAllStoresOpen(true);
        }}
        language={language}
        region={region}
        brand={brand}
        date={date}
        shopCd={selectedStore?.shopCd || ''}
        storeName={selectedStore?.storeName || ''}
        isYtdMode={isYtdMode}
        currencyCode={currencyCode}
        hkdToTwdRate={hkdToTwdRate}
      />

      <Section1CategoryDetailModal
        open={!!selectedCategoryDetail}
        onClose={() => setSelectedCategoryDetail(null)}
        language={language}
        region={region}
        brand={brand}
        date={date}
        categoryKey={selectedCategoryDetail?.key || 'currentSeason'}
        categoryTitle={selectedCategoryDetail?.title || ''}
        isYtdMode={isYtdMode}
        currencyCode={currencyCode}
        hkdToTwdRate={hkdToTwdRate}
      />

      <Section1AllStoresTreemapModal
        open={allStoresOpen}
        onClose={() => setAllStoresOpen(false)}
        onStoreSelect={(shopCd, storeName) => {
          setAllStoresOpen(false);
          setSelectedStore({ shopCd, storeName });
        }}
        language={language}
        region={region}
        date={date}
        isYtdMode={isYtdMode}
        stores={allStoreTreemapItems}
        currencyCode={currencyCode}
        hkdToTwdRate={hkdToTwdRate}
      />

      <Section1StoreCountMatrixModal
        open={storeCountMatrixOpen}
        onClose={() => setStoreCountMatrixOpen(false)}
        language={language}
        isYtdMode={isYtdMode}
        items={storeCountMatrixItems}
      />
    </article>
  );
}
