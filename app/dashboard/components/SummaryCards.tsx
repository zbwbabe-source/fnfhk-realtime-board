'use client';

import { useState, useEffect, useMemo } from 'react';
import { t, type Language } from '@/lib/translations';

interface SummaryCardsProps {
  region: string;
  brand: string;
  date: string;
  isYtdMode: boolean;
  section1Data: any;
  section2Data: any;
  section3Data: any;
  language: Language;
}

interface CardKPIs {
  k1: { label: string; value: string; };
  k2: { label: string; value: string; };
  k3: { label: string; value: string; };
}

interface InsightData {
  section1Line: string;
  section2Line: string;
  section3Line: string;
}

export default function SummaryCards({
  region,
  brand,
  date,
  isYtdMode,
  section1Data,
  section2Data,
  section3Data,
  language,
}: SummaryCardsProps) {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);

  // Section1 KPI 계산
  const calculateSection1KPIs = (): CardKPIs => {
    if (!section1Data?.total_subtotal) {
      console.log('⚠️ Section1 data not loaded yet');
      return {
        k1: { label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual'), value: 'N/A' },
        k2: { label: t(language, 'yoy'), value: 'N/A' },
        k3: { label: t(language, 'progress'), value: 'N/A' },
      };
    }

    const total = section1Data.total_subtotal;
    
    console.log('📋 Total subtotal object:', total);
    
    // MTD/YTD 데이터 확인
    if (isYtdMode) {
      // YTD 모드일 때 ytd_act가 있는지 확인
      if (typeof total.ytd_act === 'undefined' || total.ytd_act === null) {
        console.log('⚠️ YTD data not available in total_subtotal');
        return {
          k1: { label: t(language, 'ytdActual'), value: 'N/A' },
          k2: { label: t(language, 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    } else {
      // MTD 모드일 때 mtd_act가 있는지 확인
      if (typeof total.mtd_act === 'undefined' || total.mtd_act === null) {
        console.log('⚠️ MTD data not available in total_subtotal', { 
          hasData: !!section1Data, 
          hasTotal: !!total,
          totalKeys: Object.keys(total),
          mtd_act: total.mtd_act 
        });
        return {
          k1: { label: t(language, 'monthlyActual'), value: 'N/A' },
          k2: { label: t(language, 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    }

    const actual = isYtdMode ? total.ytd_act : total.mtd_act;
    const yoy = isYtdMode ? total.yoy_ytd : total.yoy;
    const progress = isYtdMode ? total.progress_ytd : total.progress;

    console.log('🎯 Section1 KPI Calculation:', {
      isYtdMode,
      total,
      actual,
      yoy,
      progress,
      mtd_act: total.mtd_act,
      mtd_yoy: total.yoy,
      mtd_progress: total.progress,
      ytd_act: total.ytd_act,
      ytd_yoy: total.yoy_ytd,
      ytd_progress: total.progress_ytd,
    });

    const unitLabel = language === 'ko' ? ' (HKD)' : ' (HKD)';

    return {
      k1: {
        label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual') + unitLabel,
        value: formatCurrency(actual),
      },
      k2: {
        label: t(language, 'yoy'),
        value: `${yoy.toFixed(0)}%`,
      },
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
      },
    };
  };

  // Section2 KPI 계산
  const calculateSection2KPIs = (): CardKPIs => {
    if (!section2Data?.header) {
      console.log('⚠️ Section2 data not loaded yet');
      return {
        k1: { label: t(language, 'sellRate'), value: 'N/A' },
        k2: { label: t(language, 'cumulativeSales'), value: 'N/A' },
        k3: { label: t(language, 'cumulativeInbound'), value: 'N/A' },
      };
    }

    const header = section2Data.header;
    const sellthrough = header.overall_sellthrough || 0;
    const totalSales = header.total_sales || 0;
    const totalInbound = header.total_inbound || 0;

    console.log('🎯 Section2 KPI Calculation:', {
      header,
      sellthrough,
      totalSales,
      totalInbound,
    });

    const unitLabel = language === 'ko' ? ' (HKD)' : ' (HKD)';

    return {
      k1: {
        label: t(language, 'sellRate'),
        value: `${sellthrough.toFixed(1)}%`,
      },
      k2: {
        label: t(language, 'cumulativeSales') + unitLabel,
        value: formatCurrency(totalSales),
      },
      k3: {
        label: t(language, 'cumulativeInbound') + unitLabel,
        value: formatCurrency(totalInbound),
      },
    };
  };

  // Section2의 시즌 정보 가져오기
  const getSection2Season = (): string => {
    if (!section2Data?.header?.sesn) return '';
    return section2Data.header.sesn;
  };

  // Section3 KPI 계산
  const calculateSection3KPIs = (): CardKPIs => {
    if (!section3Data?.header) {
      console.log('⚠️ Section3 data not loaded yet');
      return {
        k1: { label: language === 'ko' ? '과시즌 재고' : 'Old-season Stock', value: 'N/A' },
        k2: { label: language === 'ko' ? '소진율' : 'Depletion Rate', value: 'N/A' },
        k3: { label: language === 'ko' ? '정체재고 비중' : 'Stagnant Ratio', value: 'N/A' },
      };
    }

    const header = section3Data.header;
    const baseStock = header.base_stock_amt || 0;
    const currentStock = header.curr_stock_amt || 0;
    const stagnantStock = header.stagnant_stock_amt || 0;
    
    // 시즌 소진율 (10/1 기초재고 대비)
    const sellThroughRate = baseStock > 0 ? ((baseStock - currentStock) / baseStock) * 100 : 0;
    
    // 정체재고 비중 (현재재고 대비)
    const stagnantRatio = currentStock > 0 ? (stagnantStock / currentStock) * 100 : 0;

    console.log('🎯 Section3 KPI Calculation:', {
      header,
      baseStock,
      currentStock,
      stagnantStock,
      sellThroughRate,
      stagnantRatio,
    });

    const unitLabel = language === 'ko' ? ' (HKD)' : ' (HKD)';
    const depletionLabel = language === 'ko' ? '소진율 (10/1 대비)' : 'Depletion (vs 10/1)';
    const stagnantLabel = language === 'ko' ? '정체재고 비중' : 'Stagnant Ratio';

    return {
      k1: {
        label: (language === 'ko' ? '과시즌 재고' : 'Old-season Stock') + unitLabel,
        value: formatCurrency(currentStock),
      },
      k2: {
        label: depletionLabel,
        value: `${sellThroughRate.toFixed(1)}%`,
      },
      k3: {
        label: stagnantLabel,
        value: `${stagnantRatio.toFixed(1)}%`,
      },
    };
  };

  // Section3의 시즌 정보 가져오기
  const getSection3Season = (): string => {
    if (!section3Data?.season_type) return '';
    return section3Data.season_type;
  };

  // Section1 KPI 계산 (useMemo로 캐싱)
  const section1KPIs = useMemo(() => {
    console.log('🔄 Recalculating Section1 KPIs', { brand, date, isYtdMode, hasData: !!section1Data });
    return calculateSection1KPIs();
  }, [section1Data, isYtdMode, brand, date]);
  
  const section2KPIs = useMemo(() => calculateSection2KPIs(), [section2Data, brand, date]);
  const section3KPIs = useMemo(() => calculateSection3KPIs(), [section3Data, brand, date]);

  // AI 인사이트 가져오기
  useEffect(() => {
    const fetchInsights = async () => {
      if (!section1Data) return;

      setLoading(true);
      try {
        const requestBody = {
          region,
          brand,
          asofDate: date,
          mode: isYtdMode ? 'ytd' : 'mtd',
          kpis: {
            section1: {
              k1: section1KPIs.k1.value,
              k2: section1KPIs.k2.value,
              k3: section1KPIs.k3.value,
            },
            section2: {
              k1: section2KPIs.k1.value,
              k2: section2KPIs.k2.value,
              k3: section2KPIs.k3.value,
            },
            section3: {
              k1: section3KPIs.k1.value,
              k2: section3KPIs.k2.value,
              k3: section3KPIs.k3.value,
            },
          },
        };
        
        console.log('📤 Sending insight request:', requestBody);
        
        const response = await fetch('/api/insights/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('📥 Received insights:', data);
          setInsights(data);
        } else {
          console.error('❌ Insights API error:', response.status, await response.text());
        }
      } catch (error) {
        console.error('Failed to fetch insights:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [region, brand, date, isYtdMode, section1KPIs, section2KPIs, section3KPIs]);

  // 부드러운 스크롤 이동 함수
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const season = getSection2Season();
  const section2Title = season ? `${t(language, 'section2Title')} (${season})` : t(language, 'section2Title');
  
  const season3 = getSection3Season();
  const section3SeasonText = language === 'ko' ? ` (${season3} 과시즌)` : ` (${season3})`;
  const section3Title = season3 ? `${t(language, 'section3Title')}${section3SeasonText}` : t(language, 'section3Title');
  
  const cards = [
    {
      title: t(language, 'section1Title'),
      subtitle: t(language, 'section1Subtitle'),
      kpis: section1KPIs,
      insight: insights?.section1Line || t(language, 'analyzing'),
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      sectionId: 'section1',
    },
    {
      title: section2Title,
      subtitle: t(language, 'section2Subtitle'),
      kpis: section2KPIs,
      insight: insights?.section2Line || t(language, 'analyzing'),
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      sectionId: 'section2',
    },
    {
      title: section3Title,
      subtitle: t(language, 'section3Subtitle'),
      kpis: section3KPIs,
      insight: insights?.section3Line || t(language, 'analyzing'),
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      sectionId: 'section3',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map((card, idx) => (
        <div
          key={idx}
          onClick={() => scrollToSection(card.sectionId)}
          className={`${card.bgColor} ${card.borderColor} border rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer transform hover:scale-[1.02]`}
        >
          {/* 상단: 제목 */}
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
            <p className="text-xs text-gray-500">{card.subtitle}</p>
          </div>

          {/* 중단: KPI 3개 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <div className="text-xs text-gray-600 mb-1">{card.kpis.k1.label}</div>
              <div className="text-lg font-bold text-gray-900">{card.kpis.k1.value}</div>
            </div>
            <div className="text-center border-l border-r border-gray-300">
              <div className="text-xs text-gray-600 mb-1">{card.kpis.k2.label}</div>
              <div className="text-lg font-bold text-gray-900">{card.kpis.k2.value}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-600 mb-1">{card.kpis.k3.label}</div>
              <div className="text-lg font-bold text-gray-900">{card.kpis.k3.value}</div>
            </div>
          </div>

          {/* 하단: AI 인사이트 */}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-700 italic">
              {loading ? (
                <span className="animate-pulse">💡 {language === 'ko' ? '인사이트 생성 중...' : 'Generating insights...'}</span>
              ) : (
                <span>💡 {card.insight}</span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatCurrency(value: number): string {
  // 항상 천 HKD 단위로 표시
  const thousands = value / 1000;
  if (thousands >= 1000) {
    return `${(thousands / 1000).toFixed(1)}M`;
  }
  return `${thousands.toFixed(0)}K`;
}
