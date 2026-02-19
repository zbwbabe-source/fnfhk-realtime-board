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
  const RegionColumn = ({
    regionCode,
    regionLabel,
    section1Data,
    section2Data,
    section3Data,
  }: {
    regionCode: 'HKMC' | 'TW';
    regionLabel: string;
    section1Data: any;
    section2Data: any;
    section3Data: any;
  }) => (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-end justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-gray-900">{regionLabel}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{brand} | {date}</p>
        </div>
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
        />
        <Section2Card
          section2Data={section2Data}
          language={language}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={onCategoryFilterChange}
          region={regionCode}
        />
        <Section3Card
          section3Data={section3Data}
          language={language}
          region={regionCode}
          categoryFilter={section3CategoryFilter}
          onCategoryFilterChange={onSection3CategoryFilterChange}
        />
      </div>
    </section>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <RegionColumn
        regionCode="HKMC"
        regionLabel={t(language, 'hkmcRegion')}
        section1Data={hkmcSection1Data}
        section2Data={hkmcSection2Data}
        section3Data={hkmcSection3Data}
      />
      <RegionColumn
        regionCode="TW"
        regionLabel={t(language, 'twRegion')}
        section1Data={twSection1Data}
        section2Data={twSection2Data}
        section3Data={twSection3Data}
      />
    </div>
  );
}
