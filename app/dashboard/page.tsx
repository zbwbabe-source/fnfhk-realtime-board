'use client';

import { useState, useEffect } from 'react';
import RegionToggle from './components/RegionToggle';
import BrandSelect from './components/BrandSelect';
import DateSelect from './components/DateSelect';
import Section1Table from './components/Section1Table';
import Section2SellThrough from './components/Section2SellThrough';
import Section3OldSeasonInventory from './components/Section3OldSeasonInventory';
import SummaryCards from './components/SummaryCards';

export default function DashboardPage() {
  const [region, setRegion] = useState('HKMC');
  const [brand, setBrand] = useState('M');
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isYtdMode, setIsYtdMode] = useState(false);
  
  // 섹션 데이터 상태
  const [section1Data, setSection1Data] = useState<any>(null);
  const [section2Data, setSection2Data] = useState<any>(null);
  const [section3Data, setSection3Data] = useState<any>(null);

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
          <h1 className="text-2xl font-bold text-gray-900">
            FNF HKMC Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time Sales & Sell-through Dashboard
          </p>
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
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8 space-y-6">
        {/* Summary Cards */}
        <SummaryCards
          region={region}
          brand={brand}
          date={date}
          isYtdMode={isYtdMode}
          section1Data={section1Data}
          section2Data={section2Data}
          section3Data={section3Data}
        />

        {/* Section 1: Store Sales */}
        <Section1Table 
          region={region} 
          brand={brand} 
          date={date}
          onDataChange={setSection1Data}
          onYtdModeChange={setIsYtdMode}
        />

        {/* Section 2: Sell-through */}
        <Section2SellThrough 
          region={region} 
          brand={brand} 
          date={date}
          onDataChange={setSection2Data}
        />

        {/* Section 3: Old Season Inventory */}
        <Section3OldSeasonInventory 
          region={region} 
          brand={brand} 
          date={date}
          onDataChange={setSection3Data}
        />
      </div>
    </div>
  );
}
