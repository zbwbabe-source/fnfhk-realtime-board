'use client';

import { useState, useEffect, useMemo } from 'react';

interface SummaryCardsProps {
  region: string;
  brand: string;
  date: string;
  isYtdMode: boolean;
  section1Data: any;
  section2Data: any;
  section3Data: any;
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
}: SummaryCardsProps) {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);

  // Section1 KPI 계산
  const calculateSection1KPIs = (): CardKPIs => {
    if (!section1Data?.total_subtotal) {
      console.log('⚠️ Section1 data not loaded yet');
      return {
        k1: { label: isYtdMode ? '누적실적' : '당월실적', value: 'N/A' },
        k2: { label: 'YoY', value: 'N/A' },
        k3: { label: '목표대비', value: 'N/A' },
      };
    }

    const total = section1Data.total_subtotal;
    
    // MTD/YTD 데이터 확인
    if (isYtdMode) {
      // YTD 모드일 때 ytd_act가 있는지 확인
      if (typeof total.ytd_act === 'undefined') {
        console.log('⚠️ YTD data not available in total_subtotal');
        return {
          k1: { label: '누적실적', value: 'N/A' },
          k2: { label: 'YoY', value: 'N/A' },
          k3: { label: '목표대비', value: 'N/A' },
        };
      }
    } else {
      // MTD 모드일 때 mtd_act가 있는지 확인
      if (typeof total.mtd_act === 'undefined') {
        console.log('⚠️ MTD data not available in total_subtotal');
        return {
          k1: { label: '당월실적', value: 'N/A' },
          k2: { label: 'YoY', value: 'N/A' },
          k3: { label: '목표대비', value: 'N/A' },
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

    return {
      k1: {
        label: isYtdMode ? '누적실적' : '당월실적',
        value: formatCurrency(actual),
      },
      k2: {
        label: 'YoY',
        value: `${yoy.toFixed(1)}%`,
      },
      k3: {
        label: '목표대비',
        value: `${progress.toFixed(1)}%`,
      },
    };
  };

  // Section2 KPI 계산 (임시 - 실제 데이터 구조에 맞게 수정 필요)
  const calculateSection2KPIs = (): CardKPIs => {
    // TODO: section2Data 구조 확인 후 수정
    return {
      k1: { label: 'Sell-through', value: 'N/A' },
      k2: { label: '재고금액', value: 'N/A' },
      k3: { label: '전월대비', value: 'N/A' },
    };
  };

  // Section3 KPI 계산 (임시 - 실제 데이터 구조에 맞게 수정 필요)
  const calculateSection3KPIs = (): CardKPIs => {
    // TODO: section3Data 구조 확인 후 수정
    return {
      k1: { label: '과시즌 재고', value: 'N/A' },
      k2: { label: '소진율', value: 'N/A' },
      k3: { label: '전주대비', value: 'N/A' },
    };
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
        const response = await fetch('/api/insights/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setInsights(data);
        }
      } catch (error) {
        console.error('Failed to fetch insights:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [region, brand, date, isYtdMode, section1KPIs, section2KPIs, section3KPIs]);

  const cards = [
    {
      title: '섹션1: 매장별 매출',
      subtitle: 'Store Sales',
      kpis: section1KPIs,
      insight: insights?.section1Line || '분석 중...',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      title: '섹션2: 당시즌 판매율',
      subtitle: 'In-season Sell-through',
      kpis: section2KPIs,
      insight: insights?.section2Line || '분석 중...',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      title: '섹션3: 과시즌 재고 소진',
      subtitle: 'Old-season Clearance',
      kpis: section3KPIs,
      insight: insights?.section3Line || '분석 중...',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`${card.bgColor} ${card.borderColor} border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow`}
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
                <span className="animate-pulse">💡 인사이트 생성 중...</span>
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
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}
