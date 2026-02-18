'use client';

import { t, type Language } from '@/lib/translations';
import Section1Card from './Section1Card';
import Section2Card from './Section2Card';
import Section3Card from './Section3Card';

interface SummaryViewProps {
  brand: string;
  date: string;
  language: Language;
  isYtdMode: boolean;
  onYtdModeToggle: () => void;
  
  // HKMC 데이터
  hkmcSection1Data: any;
  hkmcSection2Data: any;
  hkmcSection3Data: any;
  
  // TW 데이터
  twSection1Data: any;
  twSection2Data: any;
  twSection3Data: any;
  
  // 필터 상태
  categoryFilter: 'clothes' | 'all';
  section3CategoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  onSection3CategoryFilterChange: (filter: 'clothes' | 'all') => void;
}

export default function SummaryView({
  brand,
  date,
  language,
  isYtdMode,
  onYtdModeToggle,
  hkmcSection1Data,
  hkmcSection2Data,
  hkmcSection3Data,
  twSection1Data,
  twSection2Data,
  twSection3Data,
  categoryFilter,
  section3CategoryFilter,
  onCategoryFilterChange,
  onSection3CategoryFilterChange,
}: SummaryViewProps) {
  return (
    <div className="space-y-8">
      {/* HKMC 영역 */}
      <div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-blue-600">🏢</span>
            {t(language, 'hkmcRegion')}
          </h2>
          <div className="h-1 w-20 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full mt-2"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 섹션1 카드 - HKMC */}
          <Section1Card
            isYtdMode={isYtdMode}
            section1Data={hkmcSection1Data}
            language={language}
            brand={brand}
            region="HKMC"
            date={date}
            onYtdModeToggle={onYtdModeToggle}
          />
          
          {/* 섹션2 카드 - HKMC */}
          <Section2Card
            section2Data={hkmcSection2Data}
            language={language}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={onCategoryFilterChange}
            region="HKMC"
          />
          
          {/* 섹션3 카드 - HKMC */}
          <Section3Card
            section3Data={hkmcSection3Data}
            language={language}
            region="HKMC"
            categoryFilter={section3CategoryFilter}
            onCategoryFilterChange={onSection3CategoryFilterChange}
          />
        </div>
      </div>
      
      {/* 구분선 */}
      <div className="border-t-2 border-gray-200"></div>
      
      {/* TW 영역 */}
      <div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-green-600">🏢</span>
            {t(language, 'twRegion')}
          </h2>
          <div className="h-1 w-20 bg-gradient-to-r from-green-600 to-green-400 rounded-full mt-2"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 섹션1 카드 - TW */}
          <Section1Card
            isYtdMode={isYtdMode}
            section1Data={twSection1Data}
            language={language}
            brand={brand}
            region="TW"
            date={date}
            onYtdModeToggle={onYtdModeToggle}
          />
          
          {/* 섹션2 카드 - TW */}
          <Section2Card
            section2Data={twSection2Data}
            language={language}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={onCategoryFilterChange}
            region="TW"
          />
          
          {/* 섹션3 카드 - TW */}
          <Section3Card
            section3Data={twSection3Data}
            language={language}
            region="TW"
            categoryFilter={section3CategoryFilter}
            onCategoryFilterChange={onSection3CategoryFilterChange}
          />
        </div>
      </div>
    </div>
  );
}
