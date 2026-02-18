'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { t, type Language } from '@/lib/translations';

export default function DashboardPage() {
  const [region, setRegion] = useState('HKMC');
  const [brand, setBrand] = useState('M');
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isYtdMode, setIsYtdMode] = useState(false);
  const [language, setLanguage] = useState<Language>('ko');
  const [categoryFilter, setCategoryFilter] = useState<'clothes' | 'all'>('clothes');
  const [section3CategoryFilter, setSection3CategoryFilter] = useState<'clothes' | 'all'>('clothes');
  const [isSummaryView, setIsSummaryView] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [section1Data, setSection1Data] = useState<any>(null);
  const [section2Data, setSection2Data] = useState<any>(null);
  const [section3Data, setSection3Data] = useState<any>(null);

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

    const fetchSummaryData = async () => {
      try {
        const mode = isYtdMode ? 'ytd' : 'mtd';
        const [hkmcS1, hkmcS2, hkmcS3, twS1, twS2, twS3] = await Promise.all([
          fetch(`/api/section1/store-sales?region=HKMC&brand=${brand}&date=${date}&mode=${mode}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section2/sellthrough?region=HKMC&brand=${brand}&date=${date}&category_filter=${categoryFilter}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section3/old-season-inventory?region=HKMC&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section1/store-sales?region=TW&brand=${brand}&date=${date}&mode=${mode}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section2/sellthrough?region=TW&brand=${brand}&date=${date}&category_filter=${categoryFilter}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/section3/old-season-inventory?region=TW&brand=${brand}&date=${date}&category_filter=${section3CategoryFilter}`).then((r) => (r.ok ? r.json() : null)),
        ]);

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
      } catch (error) {
        console.error('Error fetching summary data:', error);
        setDataLoadStatus({
          section1: 'error',
          section2: 'error',
          section3: 'error',
        });
      }
    };

    fetchSummaryData();
  }, [isSummaryView, date, brand, isYtdMode, categoryFilter, section3CategoryFilter]);

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
        const res = await fetch('/api/meta');
        const data = await res.json();

        if (data.available_dates && data.available_dates.length > 0) {
          setAvailableDates(data.available_dates);
          setDate(data.available_dates[0]);
        }
      } catch (error) {
        console.error('Failed to fetch meta:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMeta();
  }, []);

  const allDataLoaded = dataLoadStatus.section1 === 'success' && dataLoadStatus.section2 === 'success' && dataLoadStatus.section3 === 'success';
  const anyDataLoading = dataLoadStatus.section1 === 'loading' || dataLoadStatus.section2 === 'loading' || dataLoadStatus.section3 === 'loading';
  const anyDataError = dataLoadStatus.section1 === 'error' || dataLoadStatus.section2 === 'error' || dataLoadStatus.section3 === 'error';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t(language, 'title')}</h1>
              <p className="text-sm text-gray-600 mt-1">{t(language, 'subtitle')}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage('ko')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  language === 'ko' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                KR
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  language === 'en' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            {isSummaryView ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setRegion('HKMC');
                    setIsSummaryView(false);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-md border bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800 shadow-sm transition-all"
                >
                  🏢 HKMC 상세
                </button>
                <button
                  onClick={() => {
                    setRegion('TW');
                    setIsSummaryView(false);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-md border bg-gradient-to-r from-green-600 to-green-700 text-white border-green-600 hover:from-green-700 hover:to-green-800 shadow-sm transition-all"
                >
                  🏢 TW 상세
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSummaryView(true)}
                  className="px-4 py-2 text-sm font-medium rounded-md border bg-gradient-to-r from-purple-600 to-purple-700 text-white border-purple-600 hover:from-purple-700 hover:to-purple-800 shadow-sm transition-all"
                >
                  📊 {t(language, 'summary')}
                </button>
              </div>
            )}

            {!isSummaryView && <RegionToggle value={region} onChange={setRegion} />}
            <BrandSelect value={brand} onChange={setBrand} />
            <DateSelect value={date} onChange={setDate} availableDates={availableDates} />

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
                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
}
