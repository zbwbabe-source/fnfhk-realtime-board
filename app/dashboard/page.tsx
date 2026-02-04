'use client';

import { useState, useEffect, useCallback } from 'react';
import RegionToggle from './components/RegionToggle';
import BrandSelect from './components/BrandSelect';
import DateSelect from './components/DateSelect';
import Section1Table from './components/Section1Table';
import Section2SellThrough from './components/Section2SellThrough';
import Section3OldSeasonInventory from './components/Section3OldSeasonInventory';
import SummaryCards from './components/SummaryCards';
import InsightBanner from './components/InsightBanner';
import { t, type Language } from '@/lib/translations';

export default function DashboardPage() {
  const [region, setRegion] = useState('HKMC');
  const [brand, setBrand] = useState('M');
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isYtdMode, setIsYtdMode] = useState(false);
  const [language, setLanguage] = useState<'ko' | 'en'>('ko'); // 언어 상태 추가
  
  // 새로고침 키 (변경 시 모든 섹션이 리렌더링됨)
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 섹션 데이터 상태
  const [section1Data, setSection1Data] = useState<any>(null);
  const [section2Data, setSection2Data] = useState<any>(null);
  const [section3Data, setSection3Data] = useState<any>(null);

  // 데이터 로딩 상태 추적
  const [dataLoadStatus, setDataLoadStatus] = useState<{
    section1: 'idle' | 'loading' | 'success' | 'error';
    section2: 'idle' | 'loading' | 'success' | 'error';
    section3: 'idle' | 'loading' | 'success' | 'error';
  }>({
    section1: 'idle',
    section2: 'idle',
    section3: 'idle',
  });

  // 날짜/지역/브랜드 변경 시 로딩 상태로 리셋
  useEffect(() => {
    if (date) {
      setDataLoadStatus({
        section1: 'loading',
        section2: 'loading',
        section3: 'loading',
      });
    }
  }, [region, brand, date]);

  // 새로고침 핸들러
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    // 데이터 상태 초기화
    setSection1Data(null);
    setSection2Data(null);
    setSection3Data(null);
    // 로딩 상태 초기화
    setDataLoadStatus({
      section1: 'loading',
      section2: 'loading',
      section3: 'loading',
    });
  };

  // 섹션별 데이터 변경 핸들러 (로딩 상태 추적 포함) - useCallback으로 메모이제이션
  const handleSection1Change = useCallback((data: any) => {
    setSection1Data(data);
    setDataLoadStatus(prev => ({ ...prev, section1: data ? 'success' : 'error' }));
  }, []);

  const handleSection2Change = useCallback((data: any) => {
    setSection2Data(data);
    setDataLoadStatus(prev => ({ ...prev, section2: data ? 'success' : 'error' }));
  }, []);

  const handleSection3Change = useCallback((data: any) => {
    setSection3Data(data);
    setDataLoadStatus(prev => ({ ...prev, section3: data ? 'success' : 'error' }));
  }, []);

  // 전체 로딩 상태 계산
  const allDataLoaded = dataLoadStatus.section1 === 'success' && 
                        dataLoadStatus.section2 === 'success' && 
                        dataLoadStatus.section3 === 'success';
  const anyDataLoading = dataLoadStatus.section1 === 'loading' || 
                         dataLoadStatus.section2 === 'loading' || 
                         dataLoadStatus.section3 === 'loading';
  const anyDataError = dataLoadStatus.section1 === 'error' || 
                       dataLoadStatus.section2 === 'error' || 
                       dataLoadStatus.section3 === 'error';

  // 메타 데이터 로드
  useEffect(() => {
    async function fetchMeta() {
      try {
        const res = await fetch('/api/meta');
        const data = await res.json();
        
        if (data.available_dates && data.available_dates.length > 0) {
          setAvailableDates(data.available_dates);
          setDate(data.available_dates[0]); // 어제 날짜 기본 선택
        }
      } catch (error) {
        console.error('Failed to fetch meta:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMeta();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t(language, 'title')}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {t(language, 'subtitle')}
              </p>
            </div>
            
            {/* 언어 전환 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage('ko')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  language === 'ko'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                한국어
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  language === 'en'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <RegionToggle value={region} onChange={setRegion} />
            <BrandSelect value={brand} onChange={setBrand} />
            <DateSelect 
              value={date} 
              onChange={setDate} 
              availableDates={availableDates}
            />
            
            {/* 데이터 로딩 상태 표시 - 심플하게 */}
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
              
              {/* 새로고침 버튼 - 심플하게 */}
              <button
                onClick={handleRefresh}
                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={t(language, 'refreshData')}
                disabled={anyDataLoading}
              >
                <svg 
                  className={`w-5 h-5 ${anyDataLoading ? 'animate-spin' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8 space-y-6">
        {/* AI Insight Banner - 섹션별 요약 위에 표시 */}
        <InsightBanner
          region={region}
          brand={brand}
          asofDate={date}
          language={language}
          section1Data={section1Data}
          section2Data={section2Data}
          section3Data={section3Data}
        />

        {/* Summary Cards */}
        <SummaryCards
          region={region}
          brand={brand}
          date={date}
          isYtdMode={isYtdMode}
          section1Data={section1Data}
          section2Data={section2Data}
          section3Data={section3Data}
          language={language}
        />

        {/* Section 1: Store Sales */}
        <div id="section1">
          <Section1Table 
            key={`section1-${refreshKey}`}
            region={region} 
            brand={brand} 
            date={date}
            onDataChange={handleSection1Change}
            onYtdModeChange={setIsYtdMode}
            language={language}
          />
        </div>

        {/* Section 2: Sell-through */}
        <div id="section2">
          <Section2SellThrough 
            key={`section2-${refreshKey}`}
            region={region} 
            brand={brand} 
            date={date}
            onDataChange={handleSection2Change}
            language={language}
          />
        </div>

        {/* Section 3: Old Season Inventory */}
        <div id="section3">
          <Section3OldSeasonInventory 
            key={`section3-${refreshKey}`}
            region={region} 
            brand={brand} 
            date={date}
            onDataChange={handleSection3Change}
            language={language}
          />
        </div>
      </div>
    </div>
  );
}
