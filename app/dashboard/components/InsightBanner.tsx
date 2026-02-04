'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface InsightBannerProps {
  region: string;
  brand: string;
  asofDate: string;
  language: Language;
  section1Data: any;
  section2Data: any;
  section3Data: any;
}

interface Insights {
  diagnosis: string;
  shortTermStrategy: string;
  longTermStrategy: string;
}

export default function InsightBanner({
  region,
  brand,
  asofDate,
  language,
  section1Data,
  section2Data,
  section3Data,
}: InsightBannerProps) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // 모든 섹션 데이터가 로드되었을 때만 인사이트 생성
    if (!asofDate || !section1Data || !section2Data || !section3Data) {
      return;
    }

    async function fetchInsights() {
      setLoading(true);
      setError('');

      try {
        // KPI 데이터 추출
        const section1KPIs = extractSection1KPIs(section1Data);
        const section2KPIs = extractSection2KPIs(section2Data);
        const section3KPIs = extractSection3KPIs(section3Data);

        const response = await fetch('/api/insights/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region,
            brand,
            asofDate,
            language,
            section1: section1KPIs,
            section2: section2KPIs,
            section3: section3KPIs,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch insights');
        }

        const data = await response.json();
        setInsights(data);
      } catch (err: any) {
        console.error('InsightBanner error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchInsights();
  }, [region, brand, asofDate, language, section1Data, section2Data, section3Data]);

  // Section 1 KPI 추출
  function extractSection1KPIs(data: any) {
    if (!data || !data.stores) {
      return { actual: 0, yoy: 0, progress: 0 };
    }

    // 전체 합계 계산
    let totalActual = 0;
    let totalTarget = 0;
    let totalActualPY = 0;

    // stores 배열에서 모든 매장의 데이터 합산
    Object.values(data.stores).forEach((channelStores: any) => {
      if (Array.isArray(channelStores)) {
        channelStores.forEach((store: any) => {
          totalActual += store.mtd_act || 0;
          totalTarget += store.target_mth || 0;
          totalActualPY += store.mtd_act_py || 0;
        });
      }
    });

    const progress = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
    const yoy = totalActualPY > 0 ? (totalActual / totalActualPY) * 100 : 0;

    return {
      actual: totalActual,
      yoy,
      progress,
    };
  }

  // Section 2 KPI 추출
  function extractSection2KPIs(data: any) {
    if (!data || !data.header) {
      return { sellthrough: 0, totalSales: 0, totalInbound: 0 };
    }

    return {
      sellthrough: data.header.overall_sellthrough || 0,
      totalSales: data.header.total_sales || 0,
      totalInbound: data.header.total_inbound || 0,
    };
  }

  // Section 3 KPI 추출
  function extractSection3KPIs(data: any) {
    if (!data || !data.years || data.years.length === 0) {
      return { currentStock: 0, clearanceRate: 0, stagnantRatio: 0 };
    }

    // 전체 연차 합산
    let totalCurrentStock = 0;
    let totalBaseStock = 0;
    let totalStagnantStock = 0;

    data.years.forEach((year: any) => {
      totalCurrentStock += year.current_stock || 0;
      totalBaseStock += year.base_stock || 0;
      totalStagnantStock += year.stagnant_stock || 0;
    });

    const clearanceRate = totalBaseStock > 0 
      ? ((totalBaseStock - totalCurrentStock) / totalBaseStock) * 100 
      : 0;
    const stagnantRatio = totalCurrentStock > 0 
      ? (totalStagnantStock / totalCurrentStock) * 100 
      : 0;

    return {
      currentStock: totalCurrentStock,
      clearanceRate,
      stagnantRatio,
    };
  }

  // 데이터가 없으면 표시하지 않음
  if (!asofDate || !section1Data || !section2Data || !section3Data) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 border border-indigo-200 rounded-xl p-5 mb-6 shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🤖</span>
        <h3 className="text-sm font-semibold text-indigo-800">
          {language === 'ko' ? 'AI 인사이트' : 'AI Insights'}
        </h3>
        <span className="text-xs text-indigo-500">
          ({asofDate} {language === 'ko' ? '기준' : 'as of'})
        </span>
        {loading && (
          <span className="ml-2 text-xs text-indigo-400 animate-pulse">
            {language === 'ko' ? '분석 중...' : 'Analyzing...'}
          </span>
        )}
      </div>

      {/* 로딩 상태 */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-indigo-200 rounded w-20 mb-2"></div>
              <div className="h-4 bg-indigo-100 rounded w-full"></div>
              <div className="h-4 bg-indigo-100 rounded w-3/4 mt-1"></div>
            </div>
          ))}
        </div>
      )}

      {/* 에러 상태 */}
      {error && !loading && (
        <div className="text-red-600 text-sm">
          {language === 'ko' ? '인사이트 생성 중 오류가 발생했습니다.' : 'Error generating insights.'}
        </div>
      )}

      {/* 인사이트 표시 */}
      {insights && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 현재 진단 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <span className="text-base">🔍</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-indigo-700 mb-1">
                {language === 'ko' ? '현재 진단' : 'Current Diagnosis'}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {insights.diagnosis}
              </p>
            </div>
          </div>

          {/* 단기전략 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-base">⚡</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-orange-700 mb-1">
                {language === 'ko' ? '단기전략' : 'Short-term Strategy'}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {insights.shortTermStrategy}
              </p>
            </div>
          </div>

          {/* 중장기 전략 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-base">🎯</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-green-700 mb-1">
                {language === 'ko' ? '중장기 전략' : 'Long-term Strategy'}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {insights.longTermStrategy}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
