'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import BrandSelect from './components/BrandSelect';
import DailyHighlight from './components/DailyHighlight';
import DateSelect from './components/DateSelect';
import Section1Card from './components/Section1Card';
import Section1StoreBarChart from './components/Section1StoreBarChart';
import Section1Table from './components/Section1Table';
import Section2Card from './components/Section2Card';
import Section2SellThrough from './components/Section2SellThrough';
import Section2Treemap from './components/Section2Treemap';
import Section3Card from './components/Section3Card';
import Section3TargetHeatmap from './components/Section3TargetHeatmap';
import Section3OldSeasonInventory from './components/Section3OldSeasonInventory';
import SummaryView from './components/SummaryView';
import DataManagementModal from './components/DataManagementModal';
import GuideModal from './components/GuideModal';
import { t, type Language } from '@/lib/translations';
import { getExchangeRate, getPeriodFromDateString } from '@/lib/exchange-rate-utils';

type DetailExportMode = 'mtd' | 'ytd';
type ExportRegion = 'HKMC' | 'TW';

function getKstYesterdayString(): string {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + 9 * 60 * 60000);
  kstTime.setDate(kstTime.getDate() - 1);
  const year = kstTime.getFullYear();
  const month = String(kstTime.getMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clampDateToMax(candidate: string, maxDate: string): string {
  if (!candidate) return '';
  if (!maxDate) return candidate;
  return candidate > maxDate ? maxDate : candidate;
}

function getPreviousYearSameDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setFullYear(date.getFullYear() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDetailExportStores(section1Data: any, region: 'HKMC' | 'TW') {
  if (!section1Data || typeof section1Data !== 'object') return [];

  const storeGroups =
    region === 'TW'
      ? [section1Data.tw_normal, section1Data.tw_outlet, section1Data.tw_online]
      : [
          section1Data.hk_normal,
          section1Data.hk_outlet,
          section1Data.hk_online,
          section1Data.mc_normal,
          section1Data.mc_outlet,
          section1Data.mc_online,
        ];

  const deduped = new Map<string, any>();
  storeGroups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .filter((store) => store && typeof store === 'object')
    .forEach((store) => {
      const shopCd = String(store.shop_cd || '').trim();
      if (!shopCd || shopCd.includes('_TOTAL')) return;
      if (!deduped.has(shopCd)) {
        deduped.set(shopCd, store);
      }
    });

  return [...deduped.values()].sort((a, b) =>
    String(a.shop_cd || '').localeCompare(String(b.shop_cd || ''))
  );
}

function getBrandLabel(brandCode: string): string {
  if (brandCode === 'M') return 'MLB';
  if (brandCode === 'X') return 'Discovery';
  return brandCode;
}

export default function DashboardPage() {
  const fallbackDate = getKstYesterdayString();
  const [region, setRegion] = useState('HKMC');
  const [brand, setBrand] = useState('M');
  const [date, setDate] = useState(fallbackDate);
  const [latestDate, setLatestDate] = useState(fallbackDate);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [isYtdMode, setIsYtdMode] = useState(false);
  const [language, setLanguage] = useState<Language>('ko');
  const [categoryFilter, setCategoryFilter] = useState<'clothes' | 'all'>('clothes');
  const [section3CategoryFilter, setSection3CategoryFilter] = useState<'clothes' | 'all'>('clothes');
  const [section1DetailViewMode, setSection1DetailViewMode] = useState<'season' | 'top5' | 'worst5'>('season');
  const [activeTab, setActiveTab] = useState<'summary' | 'hkmc' | 'tw'>('summary');
  const [twCurrency, setTwCurrency] = useState<'HKD' | 'TWD'>('HKD');
  const [detailExportMode, setDetailExportMode] = useState<DetailExportMode>('mtd');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingMatrix, setIsExportingMatrix] = useState(false);
  const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [hkmcTreemapRequestKey, setHkmcTreemapRequestKey] = useState(0);
  const [twTreemapRequestKey, setTwTreemapRequestKey] = useState(0);

  const [section1Data, setSection1Data] = useState<any>(null);
  const [section2Data, setSection2Data] = useState<any>(null);
  const [section3Data, setSection3Data] = useState<any>(null);
  const refreshedSummaryKeysRef = useRef<Set<string>>(new Set());
  const prefetchedSummaryS3KeysRef = useRef<Set<string>>(new Set());
  const prefetchedDetailKeysRef = useRef<Set<string>>(new Set());

  const [hkmcSection1Data, setHkmcSection1Data] = useState<any>(null);
  const [hkmcSection2Data, setHkmcSection2Data] = useState<any>(null);
  const [hkmcSection3Data, setHkmcSection3Data] = useState<any>(null);
  const [twSection1Data, setTwSection1Data] = useState<any>(null);
  const [twSection2Data, setTwSection2Data] = useState<any>(null);
  const [twSection3Data, setTwSection3Data] = useState<any>(null);

  const [dataLoadStatus, setDataLoadStatus] = useState<{
    section1: 'idle' | 'loading' | 'success' | 'error';
    section2: 'idle' | 'loading' | 'success' | 'error';
    section3: 'idle' | 'loading' | 'success' | 'error';
  }>({
    section1: 'idle',
    section2: 'idle',
    section3: 'idle',
  });

  useEffect(() => {
    if (!date) return;

    setDataLoadStatus({
      section1: 'loading',
      section2: 'loading',
      section3: 'loading',
    });
  }, [region, brand, date, activeTab]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    setSection1Data(null);
    setSection2Data(null);
    setSection3Data(null);
    setDataLoadStatus({
      section1: 'loading',
      section2: 'loading',
      section3: 'loading',
    });
  };

  const handleOpenRegionTreemap = useCallback((targetRegion: 'HKMC' | 'TW') => {
    if (targetRegion === 'HKMC') {
      setHkmcTreemapRequestKey((prev) => prev + 1);
      return;
    }
    setTwTreemapRequestKey((prev) => prev + 1);
  }, []);

  const handleDownloadSummaryJson = useCallback(async (targetRegion: 'HKMC' | 'TW') => {
    if (!date || activeTab !== 'summary') return;

    setIsExportingJson(true);

    try {
      const regionSectionData =
        targetRegion === 'HKMC'
          ? {
              section1: hkmcSection1Data,
              section2: hkmcSection2Data,
              section3: hkmcSection3Data,
            }
          : {
              section1: twSection1Data,
              section2: twSection2Data,
              section3: twSection3Data,
            };

      const payload = {
        exported_at: new Date().toISOString(),
        dashboard_date: date,
        brand,
        region: targetRegion,
        export_currency: 'HKD',
        mode: isYtdMode ? 'ytd' : 'mtd',
        language,
        export_profile: 'llm-compact',
        summary_filters: {
          section2_category_filter: categoryFilter,
          section3_category_filter: section3CategoryFilter,
          section1_detail_view_mode: section1DetailViewMode,
        },
        data: regionSectionData,
        omitted_data: [
          'modal_data.section1.all_stores_treemap_source',
          'modal_data.section1.store_detail_by_store',
          'modal_data.section2.treemap',
          'modal_data.section3.detail',
        ],
      };

      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `dashboard-summary-${targetRegion.toLowerCase()}-${brand}-${date}-${isYtdMode ? 'ytd' : 'mtd'}-hkd-compact.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export dashboard JSON with modal data:', error);
      window.alert(language === 'ko' ? '대시보드 JSON 내보내기에 실패했습니다.' : 'Failed to export dashboard JSON.');
    } finally {
      setIsExportingJson(false);
    }
  }, [
    activeTab,
    brand,
    categoryFilter,
    date,
    hkmcSection1Data,
    hkmcSection2Data,
    hkmcSection3Data,
    isYtdMode,
    language,
    section1DetailViewMode,
    section3CategoryFilter,
    twSection1Data,
    twSection2Data,
    twSection3Data,
  ]);

  const handleDownloadShopSalesMatrix = useCallback((targetRegion: 'HKMC' | 'TW') => {
    if (activeTab === 'summary' || !date) return;

    const exportAllBrandStoreSales = async (regionToExport: ExportRegion) => {
      setIsExportingMatrix(true);

      try {
        const exportBrands = ['M', 'X'];
        const lyDate = getPreviousYearSameDate(date);
        const responses = await Promise.all(
          exportBrands.map(async (brandCode) => {
            const [tyResponse, lyResponse] = await Promise.all([
              fetch(
                `/api/section1/store-sales?region=${regionToExport}&brand=${brandCode}&date=${date}&mode=${detailExportMode}`,
                { cache: 'no-store' }
              ),
              fetch(
                `/api/section1/store-sales?region=${regionToExport}&brand=${brandCode}&date=${lyDate}&mode=${detailExportMode}`,
                { cache: 'no-store' }
              ),
            ]);

            if (!tyResponse.ok) {
              throw new Error(`Failed to fetch section1 export data for ${regionToExport}/${brandCode}/${date}`);
            }

            if (!lyResponse.ok) {
              throw new Error(`Failed to fetch section1 export data for ${regionToExport}/${brandCode}/${lyDate}`);
            }

            const [tyJson, lyJson] = await Promise.all([tyResponse.json(), lyResponse.json()]);
            return { brandCode, tyData: tyJson, lyData: lyJson };
          })
        );

        const period = getPeriodFromDateString(date);
        const twdToHkdRate = getExchangeRate(period);
        const hkdToTwdRateForExport = twdToHkdRate > 0 ? 1 / twdToHkdRate : 1;

        const workbook = XLSX.utils.book_new();
        const matrixRows = responses
          .flatMap(({ brandCode, tyData, lyData }) => {
            const lyStoreMap = new Map(
              getDetailExportStores(lyData, regionToExport).map((store) => [String(store.shop_cd || ''), store])
            );

            return getDetailExportStores(tyData, regionToExport).map((store) => {
              const shopCode = String(store.shop_cd || '');
              const lyStore = lyStoreMap.get(shopCode);
              const tagSalesHkd = Number(detailExportMode === 'ytd' ? store.ytd_tag || 0 : store.mtd_tag || 0);
              const actualSalesHkd = Number(detailExportMode === 'ytd' ? store.ytd_act || 0 : store.mtd_act || 0);
              const targetSalesHkd = Number(detailExportMode === 'ytd' ? store.ytd_target || 0 : store.target_mth || 0);
              const lyTagSalesHkd = Number(
                detailExportMode === 'ytd' ? lyStore?.ytd_tag || 0 : lyStore?.mtd_tag || 0
              );
              const lyActualSalesHkd = Number(
                detailExportMode === 'ytd' ? lyStore?.ytd_act || 0 : lyStore?.mtd_act || 0
              );
              const lyTargetSalesHkd = Number(
                detailExportMode === 'ytd' ? lyStore?.ytd_target || 0 : lyStore?.target_mth || 0
              );
              const actualYoy =
                lyActualSalesHkd > 0 ? Number(((actualSalesHkd / lyActualSalesHkd) * 100).toFixed(2)) : null;

              if (regionToExport === 'TW') {
                return {
                  Brand: getBrandLabel(brandCode),
                  Country: String(store.country || regionToExport),
                  'Shop Code': shopCode,
                  'Shop Name': String(store.shop_name || store.shop_cd || ''),
                  [`TAG Sales ${date} (HKD)`]: tagSalesHkd,
                  [`Actual Sales ${date} (HKD)`]: actualSalesHkd,
                  [`Target ${date} (HKD)`]: targetSalesHkd,
                  [`TAG Sales ${date} (TWD)`]: Number((tagSalesHkd * hkdToTwdRateForExport).toFixed(2)),
                  [`Actual Sales ${date} (TWD)`]: Number((actualSalesHkd * hkdToTwdRateForExport).toFixed(2)),
                  [`Target ${date} (TWD)`]: Number((targetSalesHkd * hkdToTwdRateForExport).toFixed(2)),
                  [`TAG Sales ${lyDate} (HKD)`]: lyTagSalesHkd,
                  [`Actual Sales ${lyDate} (HKD)`]: lyActualSalesHkd,
                  [`Target ${lyDate} (HKD)`]: lyTargetSalesHkd,
                  [`TAG Sales ${lyDate} (TWD)`]: Number((lyTagSalesHkd * hkdToTwdRateForExport).toFixed(2)),
                  [`Actual Sales ${lyDate} (TWD)`]: Number((lyActualSalesHkd * hkdToTwdRateForExport).toFixed(2)),
                  [`Target ${lyDate} (TWD)`]: Number((lyTargetSalesHkd * hkdToTwdRateForExport).toFixed(2)),
                  'Actual YoY (%)': actualYoy,
                };
              }

              return {
                Brand: getBrandLabel(brandCode),
                Country: String(store.country || ''),
                'Shop Code': shopCode,
                'Shop Name': String(store.shop_name || store.shop_cd || ''),
                [`TAG Sales ${date} (HKD)`]: tagSalesHkd,
                [`Actual Sales ${date} (HKD)`]: actualSalesHkd,
                [`Target ${date} (HKD)`]: targetSalesHkd,
                [`TAG Sales ${lyDate} (HKD)`]: lyTagSalesHkd,
                [`Actual Sales ${lyDate} (HKD)`]: lyActualSalesHkd,
                [`Target ${lyDate} (HKD)`]: lyTargetSalesHkd,
                'Actual YoY (%)': actualYoy,
              };
            });
          })
          .sort((a, b) => {
            const brandCompare = String(a.Brand || '').localeCompare(String(b.Brand || ''));
            if (brandCompare !== 0) return brandCompare;
            return String(a['Shop Code'] || '').localeCompare(String(b['Shop Code'] || ''));
          });

        const metaRows =
          regionToExport === 'TW'
            ? [
                ['As Of Date', date, 'Region', regionToExport],
                ['LY Same Period', lyDate, 'Mode', detailExportMode.toUpperCase()],
                ['Exchange Rate Basis Month', period, 'TWD->HKD', twdToHkdRate],
                [],
              ]
            : [
                ['As Of Date', date, 'Region', regionToExport],
                ['LY Same Period', lyDate, 'Mode', detailExportMode.toUpperCase()],
                ['Currency', 'HKD'],
                [],
              ];

        const worksheet = XLSX.utils.aoa_to_sheet(metaRows);
        XLSX.utils.sheet_add_json(worksheet, matrixRows, {
          origin: 'A4',
        });
        worksheet['!cols'] =
          regionToExport === 'TW'
            ? [
                { wch: 14 },
                { wch: 10 },
                { wch: 14 },
                { wch: 28 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 14 },
              ]
            : [
                { wch: 14 },
                { wch: 10 },
                { wch: 14 },
                { wch: 28 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 14 },
              ];

        XLSX.utils.book_append_sheet(workbook, worksheet, `${regionToExport}_${detailExportMode.toUpperCase()}`);
        XLSX.writeFile(workbook, `${regionToExport.toLowerCase()}-shop-sales-all-brands-${date}-${detailExportMode}.xlsx`);
      } catch (error) {
        console.error('Failed to export shop sales matrix:', error);
        window.alert(language === 'ko' ? '매장 매출 엑셀 저장에 실패했습니다.' : 'Failed to export shop sales Excel file.');
      } finally {
        setIsExportingMatrix(false);
      }
    };

    void exportAllBrandStoreSales(targetRegion);
  }, [activeTab, date, detailExportMode, language]);

  const handleSection1Change = useCallback((data: any) => {
    setSection1Data(data);
    setDataLoadStatus((prev) => ({ ...prev, section1: data ? 'success' : 'error' }));
  }, []);

  const handleSection2Change = useCallback((data: any) => {
    setSection2Data(data);
    setDataLoadStatus((prev) => ({ ...prev, section2: data ? 'success' : 'error' }));
  }, []);

  const handleSection3Change = useCallback((data: any) => {
    setSection3Data(data);
    setDataLoadStatus((prev) => ({ ...prev, section3: data ? 'success' : 'error' }));
  }, []);

  useEffect(() => {
    if (activeTab !== 'summary' || !date || !brand) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchSummaryData = async () => {
      try {
        // Prevent stale previous-date cards from staying visible when latest fetch fails.
        setHkmcSection1Data(null);
        setTwSection1Data(null);
        setHkmcSection2Data(null);
        setTwSection2Data(null);
        setHkmcSection3Data(null);
        setTwSection3Data(null);

        const mode = isYtdMode ? 'ytd' : 'mtd';
        const summaryKey = `${brand}|${date}|${mode}|${categoryFilter}|${section3CategoryFilter}`;
        const isLatestSelectedDate = !!latestDate && date === latestDate;
        const shouldForceRefresh = refreshKey > 0 || isLatestSelectedDate;
        const fetchOptions: RequestInit = isLatestSelectedDate
          ? { signal: controller.signal, cache: 'no-store' }
          : { signal: controller.signal };
        const section3FetchOptions: RequestInit = isLatestSelectedDate
          ? { signal: controller.signal, cache: 'no-store' }
          : { signal: controller.signal };
        const forceRefreshParam = shouldForceRefresh ? '&forceRefresh=true' : '';
        const fetchJson = async (
          url: string,
          options: RequestInit = fetchOptions,
          timeoutMs = 60000
        ) => {
          try {
            const fetchPromise = fetch(url, options);
            const timeoutPromise = new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), timeoutMs)
            );
            const r = (await Promise.race([fetchPromise, timeoutPromise])) as Response | null;
            if (!r) return null;
            return r.ok ? r.json() : null;
          } catch (e: any) {
            if (e?.name === 'AbortError') return null;
            console.error('Summary fetch failed:', url, e);
            return null;
          }
        };

        // Start all requests together, but render Section1 first (top card perceived speed).
        const hkmcS1Promise = fetchJson(`/api/section1/store-sales?region=HKMC&brand=${brand}&date=${date}&mode=${mode}${forceRefreshParam}`);
        const twS1Promise = fetchJson(`/api/section1/store-sales?region=TW&brand=${brand}&date=${date}&mode=${mode}${forceRefreshParam}`);
        const hkmcS2Promise = fetchJson(`/api/section2/sellthrough?region=HKMC&brand=${brand}&date=${date}&category_filter=${categoryFilter}${forceRefreshParam}`);
        const twS2Promise = fetchJson(`/api/section2/sellthrough?region=TW&brand=${brand}&date=${date}&category_filter=${categoryFilter}${forceRefreshParam}`);
        const hkmcS3Promise = fetchJson(
          `/api/section3/old-season-inventory?region=HKMC&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}&include_yoy=true&lightweight=true${forceRefreshParam}`,
          section3FetchOptions,
          150000
        );
        const twS3Promise = fetchJson(
          `/api/section3/old-season-inventory?region=TW&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}&include_yoy=true&lightweight=true${forceRefreshParam}`,
          section3FetchOptions,
          150000
        );

        const section1Task = Promise.all([hkmcS1Promise, twS1Promise]).then(([hkmcS1, twS1]) => {
          if (isCancelled) return;
          setHkmcSection1Data(hkmcS1);
          setTwSection1Data(twS1);
          setDataLoadStatus((prev) => ({ ...prev, section1: hkmcS1 && twS1 ? 'success' : 'error' }));
        });

        const section2Task = Promise.all([hkmcS2Promise, twS2Promise]).then(([hkmcS2, twS2]) => {
          if (isCancelled) return;
          setHkmcSection2Data(hkmcS2);
          setTwSection2Data(twS2);
          setDataLoadStatus((prev) => ({ ...prev, section2: hkmcS2 && twS2 ? 'success' : 'error' }));
        });

        const section3Task = Promise.all([hkmcS3Promise, twS3Promise]).then(([hkmcS3, twS3]) => {
          if (isCancelled) return;
          setHkmcSection3Data(hkmcS3);
          setTwSection3Data(twS3);
          setDataLoadStatus((prev) => ({ ...prev, section3: hkmcS3 && twS3 ? 'success' : 'error' }));
        });

        await Promise.allSettled([section1Task, section2Task, section3Task]);
        if (isCancelled) return;

        // Warm up opposite section3 category in summary (clothes <-> all)
        const oppositeS3Filter = section3CategoryFilter === 'clothes' ? 'all' : 'clothes';
        const prefetchS3Key = `${brand}|${date}|${oppositeS3Filter}`;
        if (!prefetchedSummaryS3KeysRef.current.has(prefetchS3Key)) {
          prefetchedSummaryS3KeysRef.current.add(prefetchS3Key);
          const warmUrls = [
            `/api/section3/old-season-inventory?region=HKMC&brand=${brand}&date=${date}&category_filter=${oppositeS3Filter}&include_yoy=true&lightweight=true${forceRefreshParam}`,
            `/api/section3/old-season-inventory?region=TW&brand=${brand}&date=${date}&category_filter=${oppositeS3Filter}&include_yoy=true&lightweight=true${forceRefreshParam}`,
          ];
          Promise.all(
            warmUrls.map((u) =>
              fetch(u, { signal: controller.signal }).catch(() => null)
            )
          ).catch(() => null);
        }

        if (shouldForceRefresh) refreshedSummaryKeysRef.current.add(summaryKey);
      } catch (error) {
        if (controller.signal.aborted || isCancelled) return;
        console.error('Error fetching summary data:', error);
        setDataLoadStatus({
          section1: 'error',
          section2: 'error',
          section3: 'error',
        });
      }
    };

    fetchSummaryData();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [activeTab, date, brand, isYtdMode, categoryFilter, section3CategoryFilter, latestDate, availableDates, refreshKey]);

  useEffect(() => {
    if (activeTab === 'summary' || !date || !brand || !region) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchDetailSection3Summary = async () => {
      try {
        setSection3Data(null);

        const shouldForceRefresh = refreshKey > 0 || (!!latestDate && date === latestDate);
        const forceRefreshParam = shouldForceRefresh ? '&forceRefresh=true' : '';
        const url = `/api/section3/old-season-inventory?region=${region}&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}&include_yoy=true&lightweight=true${forceRefreshParam}`;
        const res = await fetch(
          url,
          shouldForceRefresh ? { signal: controller.signal, cache: 'no-store' } : { signal: controller.signal }
        );

        if (!res.ok) {
          throw new Error('Failed to fetch section3 summary data');
        }

        const json = await res.json();
        if (isCancelled) return;

        setSection3Data(json);
      } catch (error: any) {
        if (controller.signal.aborted || isCancelled) return;
        console.error('Error fetching detail section3 summary data:', error);
      }
    };

    fetchDetailSection3Summary();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [activeTab, region, brand, date, section3CategoryFilter, latestDate, refreshKey]);

  useEffect(() => {
    if (activeTab !== 'summary' || !date || !brand) return;
    if (
      dataLoadStatus.section1 !== 'success' ||
      dataLoadStatus.section2 !== 'success' ||
      dataLoadStatus.section3 !== 'success'
    ) {
      return;
    }

    const mode = isYtdMode ? 'ytd' : 'mtd';
    const prefetchKey = `${brand}|${date}|${mode}|${categoryFilter}|${section3CategoryFilter}|${refreshKey}`;
    if (prefetchedDetailKeysRef.current.has(prefetchKey)) return;
    prefetchedDetailKeysRef.current.add(prefetchKey);

    const controller = new AbortController();
    const shouldForceRefresh = refreshKey > 0 || (!!latestDate && date === latestDate);
    const forceRefreshParam = shouldForceRefresh ? '&forceRefresh=true' : '';
    const detailWarmupUrls = [
      `/api/section1/store-sales?region=HKMC&brand=${brand}&date=${date}${forceRefreshParam}`,
      `/api/section1/store-sales?region=TW&brand=${brand}&date=${date}${forceRefreshParam}`,
      `/api/section2/sellthrough?region=HKMC&brand=${brand}&date=${date}&category_filter=${categoryFilter}${forceRefreshParam}`,
      `/api/section2/sellthrough?region=TW&brand=${brand}&date=${date}&category_filter=${categoryFilter}${forceRefreshParam}`,
      `/api/section3/old-season-inventory?region=HKMC&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}&include_yoy=true${forceRefreshParam}`,
      `/api/section3/old-season-inventory?region=TW&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}&include_yoy=true${forceRefreshParam}`,
    ];

    void Promise.allSettled(
      detailWarmupUrls.map((url) =>
        fetch(url, shouldForceRefresh ? { signal: controller.signal, cache: 'no-store' } : { signal: controller.signal })
      )
    ).then((results) => {
      if (controller.signal.aborted) return;
      const hasSuccess = results.some((result) => result.status === 'fulfilled');
      if (!hasSuccess) {
        prefetchedDetailKeysRef.current.delete(prefetchKey);
      }
    });

    return () => {
      controller.abort();
    };
  }, [
    activeTab,
    date,
    brand,
    isYtdMode,
    categoryFilter,
    section3CategoryFilter,
    refreshKey,
    dataLoadStatus.section1,
    dataLoadStatus.section2,
    dataLoadStatus.section3,
  ]);

  useEffect(() => {
    if (activeTab === 'summary' || !date || !brand || !region) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchDetailSection1 = async () => {
      try {
        setSection1Data(null);
        setDataLoadStatus((prev) => ({ ...prev, section1: 'loading' }));

        const shouldForceRefresh = refreshKey > 0 || (!!latestDate && date === latestDate);
        const forceRefreshParam = shouldForceRefresh ? '&forceRefresh=true' : '';
        const url = `/api/section1/store-sales?region=${region}&brand=${brand}&date=${date}${forceRefreshParam}`;
        const res = await fetch(
          url,
          shouldForceRefresh ? { signal: controller.signal, cache: 'no-store' } : { signal: controller.signal }
        );

        if (!res.ok) {
          throw new Error('Failed to fetch section1 detail data');
        }

        const json = await res.json();
        if (isCancelled) return;

        setSection1Data(json);
        setDataLoadStatus((prev) => ({ ...prev, section1: 'success' }));
      } catch (error: any) {
        if (controller.signal.aborted || isCancelled) return;
        console.error('Error fetching detail section1 data:', error);
        setSection1Data(null);
        setDataLoadStatus((prev) => ({ ...prev, section1: 'error' }));
      }
    };

    fetchDetailSection1();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [activeTab, region, brand, date, availableDates, refreshKey]);

  useEffect(() => {
    async function fetchMeta() {
      try {
        const latestUrl = `/api/latest-date?region=HKMC&brand=${brand}`;

        const [metaResult, latestResult] = await Promise.allSettled([
          fetch('/api/meta', { cache: 'no-store' }),
          fetch(latestUrl, { cache: 'no-store' }),
        ]);

        const metaRes = metaResult.status === 'fulfilled' ? metaResult.value : null;
        let latestRes = latestResult.status === 'fulfilled' ? latestResult.value : null;

        if (!latestRes?.ok) {
          latestRes = await fetch(`${latestUrl}&forceRefresh=true`, { cache: 'no-store' });
        }

        const data = metaRes?.ok ? await metaRes.json() : {};
        const latestData = latestRes?.ok ? await latestRes.json() : null;
        const metaDates: string[] = Array.isArray(data.available_dates) ? data.available_dates : [];
        const metaTopDate = metaDates[0] || '';
        let resolvedLatestDate = clampDateToMax(
          typeof latestData?.latest_date === 'string' ? latestData.latest_date : '',
          fallbackDate
        );

        // Guard against stale latest-date cache response by preferring fresher meta top date.
        if (resolvedLatestDate && metaTopDate && resolvedLatestDate < metaTopDate) {
          resolvedLatestDate = metaTopDate;
        }
        const nextDates = [...metaDates];

        if (resolvedLatestDate && !nextDates.includes(resolvedLatestDate)) {
          nextDates.unshift(resolvedLatestDate);
        }

        const initialDate = resolvedLatestDate || metaTopDate || fallbackDate;

        if (nextDates.length > 0) {
          setAvailableDates(nextDates);
          setDate((prev) => {
            if (prev && nextDates.includes(prev)) return prev;
            return initialDate;
          });
          setLatestDate(metaTopDate || resolvedLatestDate || fallbackDate);
        } else {
          setAvailableDates([initialDate]);
          setDate((prev) => (prev || initialDate));
          setLatestDate(initialDate);
        }
      } catch (error) {
        console.error('Failed to fetch meta:', error);
        setAvailableDates([fallbackDate]);
        setDate((prev) => (prev === fallbackDate ? prev : fallbackDate));
        setLatestDate((prev) => (prev === fallbackDate ? prev : fallbackDate));
      } finally {
        setMetaLoading(false);
      }
    }

    fetchMeta();
  }, [brand, fallbackDate]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    const checkLatestDate = async () => {
      if (disposed || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;

      try {
        const res = await fetch(`/api/latest-date?region=HKMC&brand=${brand}`, { cache: 'no-store' });
        if (!res.ok) return;

        const latestData = await res.json();
        let nextLatestDate = clampDateToMax(
          typeof latestData?.latest_date === 'string' ? latestData.latest_date : '',
          fallbackDate
        );
        const knownLatest = availableDates[0] || latestDate;

        if (nextLatestDate && knownLatest && nextLatestDate < knownLatest) {
          const refreshRes = await fetch(`/api/latest-date?region=HKMC&brand=${brand}&forceRefresh=true`, {
            cache: 'no-store',
          });
          if (refreshRes.ok) {
            const refreshedLatestData = await refreshRes.json();
            const refreshedLatestDate = clampDateToMax(
              typeof refreshedLatestData?.latest_date === 'string' ? refreshedLatestData.latest_date : '',
              fallbackDate
            );
            if (refreshedLatestDate) {
              nextLatestDate = refreshedLatestDate;
            }
          }
        }

        if (!nextLatestDate || nextLatestDate === latestDate) return;

        const wasViewingLatest = !date || date === latestDate;
        setLatestDate(nextLatestDate);
        setAvailableDates((prev) => (prev.includes(nextLatestDate) ? prev : [nextLatestDate, ...prev]));

        if (wasViewingLatest) {
          setDate(nextLatestDate);
        }
      } catch (error) {
        console.error('Failed to auto-check latest date:', error);
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void checkLatestDate();
    }, 3 * 60 * 1000);

    const handleFocus = () => {
      void checkLatestDate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkLatestDate();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [brand, date, latestDate, availableDates, fallbackDate]);

  const allDataLoaded = dataLoadStatus.section1 === 'success' && dataLoadStatus.section2 === 'success' && dataLoadStatus.section3 === 'success';
  const anyDataLoading = dataLoadStatus.section1 === 'loading' || dataLoadStatus.section2 === 'loading' || dataLoadStatus.section3 === 'loading';
  const anyDataError = dataLoadStatus.section1 === 'error' || dataLoadStatus.section2 === 'error' || dataLoadStatus.section3 === 'error';
  const twHkdToTwdRate = useMemo(() => {
    if (!date) return 1;
    const period = getPeriodFromDateString(date);
    const twdToHkdRate = getExchangeRate(period);
    if (!twdToHkdRate || twdToHkdRate <= 0) return 1;
    return 1 / twdToHkdRate;
  }, [date]);

  if (metaLoading && !date) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">{t(language, 'loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t(language, 'title')}</h1>
              <p className="mt-1 text-sm text-gray-500">{t(language, 'subtitle')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t(language, 'updated')} {date || '-'} | {t(language, 'asOf')} {date || '-'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeTab !== 'summary' && (
                <div className="flex flex-nowrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    {language === 'ko' ? '매출데이터 저장' : 'Sales Data Export'}
                  </span>
                  <div className="inline-flex flex-nowrap overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <button
                      onClick={() => setDetailExportMode('mtd')}
                      className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                        detailExportMode === 'mtd' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      MTD
                    </button>
                    <button
                      onClick={() => setDetailExportMode('ytd')}
                      className={`border-l border-gray-200 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                        detailExportMode === 'ytd' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      YTD
                    </button>
                  </div>
                  <button
                    onClick={() => handleDownloadShopSalesMatrix(region as 'HKMC' | 'TW')}
                    disabled={anyDataLoading || isExportingMatrix}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium whitespace-nowrap text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {language === 'ko' ? '파일저장' : 'Save File'}
                  </button>
                </div>
              )}
              <button
                onClick={() => setIsDataManagementOpen(true)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {language === 'ko' ? '데이터소스' : 'Data Sources'}
              </button>
              <button
                onClick={() => setIsGuideOpen(true)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Guide
              </button>
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setLanguage('ko')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    language === 'ko' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  KR
                </button>
                <button
                  onClick={() => setLanguage('en')}
                  className={`border-l border-gray-200 px-4 py-2 text-sm font-medium transition-colors ${
                    language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="h-px w-full bg-purple-200" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 whitespace-nowrap">
              <button
                onClick={() => setActiveTab('summary')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'summary' 
                    ? 'bg-purple-600 text-white' 
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t(language, 'summary')}
              </button>
              <button
                onClick={() => {
                  setRegion('HKMC');
                  setActiveTab('hkmc');
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'hkmc' 
                    ? 'bg-purple-600 text-white' 
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t(language, 'hkmcDetail')}
              </button>
              <button
                onClick={() => {
                  setRegion('TW');
                  setActiveTab('tw');
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'tw' 
                    ? 'bg-purple-600 text-white' 
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t(language, 'twDetail')}
              </button>
              </div>

              <BrandSelect value={brand} onChange={setBrand} />
              <DateSelect value={date} onChange={setDate} availableDates={availableDates} disabled={metaLoading} language={language} />
              {activeTab === 'tw' && (
                <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white whitespace-nowrap">
                <button
                  onClick={() => setTwCurrency('HKD')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    twCurrency === 'HKD' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  HKD
                </button>
                <button
                  onClick={() => setTwCurrency('TWD')}
                  className={`border-l border-gray-200 px-3 py-2 text-sm font-medium transition-colors ${
                    twCurrency === 'TWD' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  TWD
                </button>
                </div>
              )}
            </div>

            <div className="ml-auto flex flex-nowrap items-center gap-2">
              {activeTab === 'summary' && (
                <>
                  <button
                    onClick={() => handleDownloadSummaryJson('HKMC')}
                    disabled={!allDataLoaded || anyDataLoading || isExportingJson}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    HKMC JSON
                  </button>
                  <button
                    onClick={() => handleDownloadSummaryJson('TW')}
                    disabled={!allDataLoaded || anyDataLoading || isExportingJson}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    TW JSON
                  </button>
                </>
              )}
              {anyDataLoading && (
                <div className="flex items-center gap-1.5 text-blue-600 text-sm">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{t(language, 'loading')}</span>
                </div>
              )}
              {allDataLoaded && !anyDataLoading && (
                <div className="flex items-center gap-1.5 text-green-600 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t(language, 'complete')}</span>
                </div>
              )}
              {anyDataError && !anyDataLoading && (
                <div className="flex items-center gap-1.5 text-red-600 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>{t(language, 'error')}</span>
                </div>
              )}
              <button
                onClick={handleRefresh}
                className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                title={t(language, 'refreshData')}
                disabled={anyDataLoading}
              >
                <svg className={`w-5 h-5 ${anyDataLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">{language === 'ko' ? '기준일' : 'As of'} {date || '-'}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-8 space-y-6">
        {activeTab === 'summary' ? (
          <>
            {date && (
              <DailyHighlight
                date={date}
                brand={brand}
                language={language}
                isYtdMode={isYtdMode}
                hkmcSection1Data={hkmcSection1Data}
                hkmcSection2Data={hkmcSection2Data}
                hkmcSection3Data={hkmcSection3Data}
                twSection1Data={twSection1Data}
                twSection2Data={twSection2Data}
                twSection3Data={twSection3Data}
              />
            )}
            <SummaryView
              brand={brand}
              date={date}
              language={language}
              isYtdMode={isYtdMode}
              onYtdModeToggle={() => setIsYtdMode(!isYtdMode)}
              hkmcSection1Data={hkmcSection1Data}
              hkmcSection2Data={hkmcSection2Data}
              hkmcSection3Data={hkmcSection3Data}
              twSection1Data={twSection1Data}
              twSection2Data={twSection2Data}
                twSection3Data={twSection3Data}
                categoryFilter={categoryFilter}
                section3CategoryFilter={section3CategoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                onSection3CategoryFilterChange={setSection3CategoryFilter}
                section1DetailViewMode={section1DetailViewMode}
                onSection1DetailViewModeChange={setSection1DetailViewMode}
                onOpenRegionTreemap={handleOpenRegionTreemap}
                hkmcTreemapRequestKey={hkmcTreemapRequestKey}
                twTreemapRequestKey={twTreemapRequestKey}
              />
          </>
        ) : (
          <>
            <div className="mb-2 px-1 text-[11px] text-gray-500">
              {region === 'TW' ? `단위: ${twCurrency}` : '단위: HKD'} | Section2·3 {t(language, 'tagBasis')}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              <div className="h-full">
                <Section1Card
                  isYtdMode={isYtdMode}
                  section1Data={section1Data}
                  language={language}
                  brand={brand}
                  region={region}
                  date={date}
                  onYtdModeToggle={() => setIsYtdMode(!isYtdMode)}
                  showSeasonCategory={false}
                currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                hkdToTwdRate={twHkdToTwdRate}
                simpleDetail={true}
                fixedHeight={true}
              />
              </div>

              <div className="h-full">
                <Section2Card
                  section2Data={section2Data}
                  language={language}
                  categoryFilter={categoryFilter}
                  onCategoryFilterChange={setCategoryFilter}
                  region={region}
                  compactMainMetric={true}
                  currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                  hkdToTwdRate={twHkdToTwdRate}
                  fixedHeight={true}
                />
              </div>

              <div className="h-full">
                <Section3Card
                  section3Data={section3Data}
                  language={language}
                  region={region}
                  categoryFilter={section3CategoryFilter}
                  onCategoryFilterChange={setSection3CategoryFilter}
                  periodInfoPlacement="footer"
                  compactMainMetric={true}
                  currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                  hkdToTwdRate={twHkdToTwdRate}
                  simpleDetail={true}
                  fixedHeight={true}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <Section1StoreBarChart
                  region={region}
                  brand={brand}
                  date={date}
                  latestDate={availableDates[0] || ''}
                  section1Data={section1Data}
                  disableFetch={true}
                  language={language}
                  currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                  hkdToTwdRate={twHkdToTwdRate}
                />
              </div>

              <div>
                <Section2Treemap
                  region={region}
                  brand={brand}
                  date={date}
                  language={language}
                  currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                  hkdToTwdRate={twHkdToTwdRate}
                />
              </div>

              <div>
                {region === 'HKMC' ? (
                  <Section3TargetHeatmap
                    section3Data={section3Data}
                    region={region}
                    language={language}
                  />
                ) : null}
              </div>
            </div>

            <div id="section1">
              <Section1Table
                key={`section1-${refreshKey}`}
                region={region}
                brand={brand}
                date={date}
                latestDate={availableDates[0] || ''}
                section1Data={section1Data}
                disableFetch={true}
                onDataChange={handleSection1Change}
                onYtdModeChange={setIsYtdMode}
                language={language}
                currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                hkdToTwdRate={twHkdToTwdRate}
              />
            </div>

            <div id="section2">
              <Section2SellThrough
                key={`section2-${refreshKey}`}
                region={region}
                brand={brand}
                date={date}
                onDataChange={handleSection2Change}
                language={language}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                hkdToTwdRate={twHkdToTwdRate}
              />
            </div>

            <div id="section3">
              <Section3OldSeasonInventory
                key={`section3-${refreshKey}`}
                region={region}
                brand={brand}
                date={date}
                onDataChange={handleSection3Change}
                language={language}
                categoryFilter={section3CategoryFilter}
                onCategoryFilterChange={setSection3CategoryFilter}
                currencyCode={region === 'TW' ? twCurrency : 'HKD'}
                hkdToTwdRate={twHkdToTwdRate}
              />
            </div>
          </>
        )}
      </div>
      <DataManagementModal open={isDataManagementOpen} onClose={() => setIsDataManagementOpen(false)} />
      <GuideModal open={isGuideOpen} onClose={() => setIsGuideOpen(false)} language={language} />
    </div>
  );
}

