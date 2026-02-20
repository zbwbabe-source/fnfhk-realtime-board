'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandSelect from './components/BrandSelect';
import DailyHighlight from './components/DailyHighlight';
import DateSelect from './components/DateSelect';
import RegionToggle from './components/RegionToggle';
import Section1Card from './components/Section1Card';
import Section1StoreBarChart from './components/Section1StoreBarChart';
import Section1Table from './components/Section1Table';
import Section2Card from './components/Section2Card';
import Section2SellThrough from './components/Section2SellThrough';
import Section2Treemap from './components/Section2Treemap';
import Section3Card from './components/Section3Card';
import Section3OldSeasonInventory from './components/Section3OldSeasonInventory';
import SummaryView from './components/SummaryView';
import DataManagementModal from './components/DataManagementModal';
import { t, type Language } from '@/lib/translations';

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
  const [isSummaryView, setIsSummaryView] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);

  const [section1Data, setSection1Data] = useState<any>(null);
  const [section2Data, setSection2Data] = useState<any>(null);
  const [section3Data, setSection3Data] = useState<any>(null);
  const refreshedSummaryKeysRef = useRef<Set<string>>(new Set());

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

    if (isSummaryView) {
      setHkmcSection1Data(null);
      setHkmcSection2Data(null);
      setHkmcSection3Data(null);
      setTwSection1Data(null);
      setTwSection2Data(null);
      setTwSection3Data(null);
    } else {
      setSection1Data(null);
      setSection2Data(null);
      setSection3Data(null);
    }
  }, [region, brand, date, isSummaryView]);

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
    if (!isSummaryView || !date || !brand) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchSummaryData = async () => {
      try {
        const mode = isYtdMode ? 'ytd' : 'mtd';
        const isLatest = !!latestDate && date === latestDate;
        const summaryKey = `${brand}|${date}|${mode}|${categoryFilter}|${section3CategoryFilter}`;
        const shouldForceRefresh = isLatest && !refreshedSummaryKeysRef.current.has(summaryKey);
        const fetchOptions = shouldForceRefresh
          ? { cache: 'no-store' as const, signal: controller.signal }
          : { signal: controller.signal };
        const forceRefreshParam = shouldForceRefresh ? '&forceRefresh=true' : '';
        const [hkmcS1, hkmcS2, hkmcS3, twS1, twS2, twS3] = await Promise.all([
          fetch(`/api/section1/store-sales?region=HKMC&brand=${brand}&date=${date}&mode=${mode}${forceRefreshParam}`, fetchOptions).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section2/sellthrough?region=HKMC&brand=${brand}&date=${date}&category_filter=${categoryFilter}${forceRefreshParam}`, fetchOptions).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section3/old-season-inventory?region=HKMC&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}${forceRefreshParam}`, fetchOptions).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section1/store-sales?region=TW&brand=${brand}&date=${date}&mode=${mode}${forceRefreshParam}`, fetchOptions).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section2/sellthrough?region=TW&brand=${brand}&date=${date}&category_filter=${categoryFilter}${forceRefreshParam}`, fetchOptions).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section3/old-season-inventory?region=TW&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}${forceRefreshParam}`, fetchOptions).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (isCancelled) return;

        setHkmcSection1Data(hkmcS1);
        setHkmcSection2Data(hkmcS2);
        setHkmcSection3Data(hkmcS3);
        setTwSection1Data(twS1);
        setTwSection2Data(twS2);
        setTwSection3Data(twS3);

        setDataLoadStatus({
          section1: hkmcS1 && twS1 ? 'success' : 'error',
          section2: hkmcS2 && twS2 ? 'success' : 'error',
          section3: hkmcS3 && twS3 ? 'success' : 'error',
        });
        if (shouldForceRefresh) {
          refreshedSummaryKeysRef.current.add(summaryKey);
        }
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
  }, [isSummaryView, date, brand, isYtdMode, categoryFilter, section3CategoryFilter, latestDate]);

  useEffect(() => {
    if (isSummaryView || !date || !brand || !region) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchDetailSection1 = async () => {
      try {
        setSection1Data(null);
        setDataLoadStatus((prev) => ({ ...prev, section1: 'loading' }));

        const isLatestDate = !!availableDates[0] && date === availableDates[0];
        const url = `/api/section1/store-sales?region=${region}&brand=${brand}&date=${date}${isLatestDate ? '&forceRefresh=true' : ''}`;
        const res = await fetch(
          url,
          isLatestDate ? { cache: 'no-store', signal: controller.signal } : { signal: controller.signal }
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
  }, [isSummaryView, region, brand, date, availableDates, refreshKey]);

  useEffect(() => {
    async function fetchMeta() {
      try {
        const [metaRes, latestRes] = await Promise.all([
          fetch('/api/meta'),
          fetch(`/api/latest-date?region=HKMC&brand=${brand}`),
        ]);
        const data = await metaRes.json();
        const latestData = latestRes.ok ? await latestRes.json() : null;
        const resolvedLatestDate = latestData?.latest_date || '';
        const metaDates: string[] = Array.isArray(data.available_dates) ? data.available_dates : [];
        const nextDates = [...metaDates];

        if (resolvedLatestDate && !nextDates.includes(resolvedLatestDate)) {
          nextDates.unshift(resolvedLatestDate);
        }

        if (nextDates.length > 0) {
          setAvailableDates(nextDates);
          const initialDate = resolvedLatestDate || nextDates[0];
          setDate((prev) => (prev === initialDate ? prev : initialDate));
          setLatestDate(initialDate);
        } else if (resolvedLatestDate) {
          setDate((prev) => (prev === resolvedLatestDate ? prev : resolvedLatestDate));
          setLatestDate(resolvedLatestDate);
        }
      } catch (error) {
        console.error('Failed to fetch meta:', error);
      } finally {
        setMetaLoading(false);
      }
    }

    fetchMeta();
  }, []);

  const allDataLoaded = dataLoadStatus.section1 === 'success' && dataLoadStatus.section2 === 'success' && dataLoadStatus.section3 === 'success';
  const anyDataLoading = dataLoadStatus.section1 === 'loading' || dataLoadStatus.section2 === 'loading' || dataLoadStatus.section3 === 'loading';
  const anyDataError = dataLoadStatus.section1 === 'error' || dataLoadStatus.section2 === 'error' || dataLoadStatus.section3 === 'error';

  if (metaLoading && !date) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">{language === 'ko' ? '로딩 중...' : 'Loading...'}</div>
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
                {language === 'ko' ? '업데이트' : 'Updated'} {date || '-'} | {language === 'ko' ? '기준일' : 'asOf'} {date || '-'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDataManagementOpen(true)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                데이터관리
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
            {isSummaryView ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setRegion('HKMC');
                    setIsSummaryView(false);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {language === 'ko' ? 'HKMC 상세' : 'HKMC Detail'}
                </button>
                <button
                  onClick={() => {
                    setRegion('TW');
                    setIsSummaryView(false);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {language === 'ko' ? 'TW 상세' : 'TW Detail'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSummaryView(true)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {t(language, 'summary')}
                </button>
              </div>
            )}

            {!isSummaryView && <RegionToggle value={region} onChange={setRegion} />}
            <BrandSelect value={brand} onChange={setBrand} />
            <DateSelect value={date} onChange={setDate} availableDates={availableDates} disabled={metaLoading} />

            <div className="ml-auto flex items-center gap-2">
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
          <p className="mt-3 text-xs text-gray-500">{language === 'ko' ? '인사이트 기준일' : 'Insight as of'} {date || '-'}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-8 space-y-6">
        {isSummaryView ? (
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
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-6">
                <Section1Card
                  isYtdMode={isYtdMode}
                  section1Data={section1Data}
                  language={language}
                  brand={brand}
                  region={region}
                  date={date}
                  onYtdModeToggle={() => setIsYtdMode(!isYtdMode)}
                />
                <Section1StoreBarChart
                  region={region}
                  brand={brand}
                  date={date}
                  latestDate={availableDates[0] || ''}
                  section1Data={section1Data}
                  disableFetch={true}
                  language={language}
                />
              </div>

              <div className="space-y-6">
                <Section2Card
                  section2Data={section2Data}
                  language={language}
                  categoryFilter={categoryFilter}
                  onCategoryFilterChange={setCategoryFilter}
                  region={region}
                />
                <Section2Treemap region={region} brand={brand} date={date} language={language} />
              </div>

              <div className="space-y-6">
                <Section3Card
                  section3Data={section3Data}
                  language={language}
                  region={region}
                  categoryFilter={section3CategoryFilter}
                  onCategoryFilterChange={setSection3CategoryFilter}
                />
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
              />
            </div>
          </>
        )}
      </div>
      <DataManagementModal open={isDataManagementOpen} onClose={() => setIsDataManagementOpen(false)} />
    </div>
  );
}

