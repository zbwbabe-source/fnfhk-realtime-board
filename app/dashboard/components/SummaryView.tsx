'use client';

import { t, type Language } from '@/lib/translations';
import { getExchangeRate, getPeriodFromDateString } from '@/lib/exchange-rate-utils';
import Section1Card from './Section1Card';
import Section2Card from './Section2Card';
import Section3Card from './Section3Card';

interface RegionColumnProps {
  brand: string;
  date: string;
  language: Language;
  isYtdMode: boolean;
  onYtdModeToggle: () => void;
  section1Data: any;
  section2Data: any;
  section3Data: any;
  categoryFilter: 'clothes' | 'all';
  section3CategoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  onSection3CategoryFilterChange: (filter: 'clothes' | 'all') => void;
  section1DetailViewMode: 'season' | 'top5' | 'worst5';
  onSection1DetailViewModeChange: (view: 'season' | 'top5' | 'worst5') => void;
  onOpenRegionTreemap: (region: 'HKMC' | 'TW') => void;
  regionCode: 'HKMC' | 'TW';
  regionLabel: string;
  treemapRequestKey: number;
}

interface SummaryViewProps {
  brand: string;
  date: string;
  language: Language;
  isYtdMode: boolean;
  onYtdModeToggle: () => void;
  hkmcSection1Data: any;
  hkmcSection2Data: any;
  hkmcSection3Data: any;
  twSection1Data: any;
  twSection2Data: any;
  twSection3Data: any;
  categoryFilter: 'clothes' | 'all';
  section3CategoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  onSection3CategoryFilterChange: (filter: 'clothes' | 'all') => void;
  section1DetailViewMode: 'season' | 'top5' | 'worst5';
  onSection1DetailViewModeChange: (view: 'season' | 'top5' | 'worst5') => void;
  onOpenRegionTreemap: (region: 'HKMC' | 'TW') => void;
  hkmcTreemapRequestKey: number;
  twTreemapRequestKey: number;
}

function RegionColumn({
  brand,
  date,
  language,
  isYtdMode,
  onYtdModeToggle,
  section1Data,
  section2Data,
  section3Data,
  categoryFilter,
  section3CategoryFilter,
  onCategoryFilterChange,
  onSection3CategoryFilterChange,
  section1DetailViewMode,
  onSection1DetailViewModeChange,
  onOpenRegionTreemap,
  regionCode,
  regionLabel,
  treemapRequestKey,
}: RegionColumnProps) {
  const appliedExchangeRate =
    regionCode === 'TW' && date
      ? getExchangeRate(getPeriodFromDateString(date)).toFixed(4)
      : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-end justify-between border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">{regionLabel}</h2>
            {appliedExchangeRate ? (
              <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                {language === 'ko' ? `적용환율 ${appliedExchangeRate}` : `Rate ${appliedExchangeRate}`}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {brand} | {date}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenRegionTreemap(regionCode)}
          className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"
        >
          {language === 'ko' ? '매장별 현황' : 'Store Status'}
        </button>
      </div>

      <div className="space-y-5">
        <Section1Card
          isYtdMode={isYtdMode}
          section1Data={section1Data}
          language={language}
          brand={brand}
          region={regionCode}
          date={date}
          onYtdModeToggle={onYtdModeToggle}
          detailViewMode={section1DetailViewMode}
          onDetailViewModeChange={onSection1DetailViewModeChange}
          fixedHeight={true}
          openAllStoresRequestKey={treemapRequestKey}
        />
        <Section2Card
          section2Data={section2Data}
          language={language}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={onCategoryFilterChange}
          region={regionCode}
          compactMainMetric={true}
          showCategoryRanking={true}
          fixedHeight={true}
        />
        <Section3Card
          section3Data={section3Data}
          language={language}
          region={regionCode}
          categoryFilter={section3CategoryFilter}
          onCategoryFilterChange={onSection3CategoryFilterChange}
          compactMainMetric={true}
          fixedHeight={true}
        />
      </div>
    </section>
  );
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
  section1DetailViewMode,
  onSection1DetailViewModeChange,
  onOpenRegionTreemap,
  hkmcTreemapRequestKey,
  twTreemapRequestKey,
}: SummaryViewProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <RegionColumn
        brand={brand}
        date={date}
        language={language}
        isYtdMode={isYtdMode}
        onYtdModeToggle={onYtdModeToggle}
        section1Data={hkmcSection1Data}
        section2Data={hkmcSection2Data}
        section3Data={hkmcSection3Data}
        categoryFilter={categoryFilter}
        section3CategoryFilter={section3CategoryFilter}
        onCategoryFilterChange={onCategoryFilterChange}
        onSection3CategoryFilterChange={onSection3CategoryFilterChange}
        section1DetailViewMode={section1DetailViewMode}
        onSection1DetailViewModeChange={onSection1DetailViewModeChange}
        onOpenRegionTreemap={onOpenRegionTreemap}
        regionCode="HKMC"
        regionLabel={t(language, 'hkmcRegion')}
        treemapRequestKey={hkmcTreemapRequestKey}
      />
      <RegionColumn
        brand={brand}
        date={date}
        language={language}
        isYtdMode={isYtdMode}
        onYtdModeToggle={onYtdModeToggle}
        section1Data={twSection1Data}
        section2Data={twSection2Data}
        section3Data={twSection3Data}
        categoryFilter={categoryFilter}
        section3CategoryFilter={section3CategoryFilter}
        onCategoryFilterChange={onCategoryFilterChange}
        onSection3CategoryFilterChange={onSection3CategoryFilterChange}
        section1DetailViewMode={section1DetailViewMode}
        onSection1DetailViewModeChange={onSection1DetailViewModeChange}
        onOpenRegionTreemap={onOpenRegionTreemap}
        regionCode="TW"
        regionLabel={t(language, 'twRegion')}
        treemapRequestKey={twTreemapRequestKey}
      />
    </div>
  );
}
