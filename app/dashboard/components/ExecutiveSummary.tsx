'use client';

import { useState, useEffect, useRef } from 'react';
import { t, type Language } from '@/lib/translations';

interface ExecutiveSummaryProps {
  region: string;
  brand: string;
  date: string;
  language: Language;
  section1Data: any;
  section2Data: any;
  section3Data: any;
  isLoading: boolean;
  isYtdMode: boolean; // MTD/YTD 모드 추가
  preloadedSummary?: {
    main_summary: string;
    key_insights: string[];
  } | null;
  preloadedError?: string;
  onSummaryUpdated?: (data: { main_summary: string; key_insights: string[] }) => void;
}

interface SummaryData {
  main_summary: string;
  key_insights: string[];
}

export default function ExecutiveSummary({
  region,
  brand,
  date,
  language,
  section1Data,
  section2Data,
  section3Data,
  isLoading: parentLoading,
  isYtdMode,
  preloadedSummary,
  preloadedError,
  onSummaryUpdated
}: ExecutiveSummaryProps) {
  // preloaded 데이터가 있으면 그것을 사용, 없으면 기존 로직 사용
  const [summary, setSummary] = useState<SummaryData | null>(preloadedSummary || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(preloadedError || '');
  const [regenerating, setRegenerating] = useState(false);
  const manuallyEditedRef = useRef(false); // ref로 변경 - 렌더링 사이클 문제 방지
  const prevPreloadedSummaryRef = useRef<typeof preloadedSummary>(null);

  // preloaded 데이터가 실제로 변경되었을 때만 업데이트
  useEffect(() => {
    // 수동 편집 후라면 preloadedSummary로 덮어쓰지 않음
    if (manuallyEditedRef.current) {
      console.log('⏭️ Skipping preloadedSummary update (manually edited)');
      return;
    }
    
    // 이전 값과 비교하여 실제로 변경되었는지 확인
    const prevSummary = prevPreloadedSummaryRef.current;
    const hasChanged = 
      !prevSummary || 
      !preloadedSummary ||
      prevSummary.main_summary !== preloadedSummary.main_summary ||
      JSON.stringify(prevSummary.key_insights) !== JSON.stringify(preloadedSummary.key_insights);
    
    if (preloadedSummary && hasChanged) {
      console.log('📥 Updating from preloadedSummary (content changed):', preloadedSummary);
      setSummary(preloadedSummary);
      setError('');
      prevPreloadedSummaryRef.current = preloadedSummary;
    }
    if (preloadedError) {
      setError(preloadedError);
    }
  }, [preloadedSummary, preloadedError]);

  // region, brand, date가 변경되면 수동 편집 플래그 초기화
  useEffect(() => {
    manuallyEditedRef.current = false;
    prevPreloadedSummaryRef.current = null;
    console.log('🔄 Filter changed, reset manual edit flag');
  }, [region, brand, date]);

  useEffect(() => {
    // preloaded 데이터가 있으면 fetch하지 않음
    if (preloadedSummary || preloadedError) {
      return;
    }

    // 모든 섹션 데이터가 로드되었을 때만 요약 생성
    if (!section1Data || !section2Data || !section3Data || !date) {
      return;
    }

    async function fetchSummary() {
      setLoading(true);
      setError('');

      try {
        // 경과일수 계산 (1일부터 시작)
        const asofDate = new Date(date);
        const elapsedDays = asofDate.getDate();
        
        // 월 총일수 계산
        const year = asofDate.getFullYear();
        const month = asofDate.getMonth();
        const totalDays = new Date(year, month + 1, 0).getDate();

        const response = await fetch('/api/insights/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region,
            brand,
            asof_date: date,
            section1: {
              // AI 요약은 항상 당월(MTD) 데이터 사용
              achievement_rate: section1Data.total_subtotal?.progress || 0,
              yoy_ytd: section1Data.total_subtotal?.yoy || 0,
              actual_sales_ytd: section1Data.total_subtotal?.mtd_act || 0,
              target_ytd: section1Data.total_subtotal?.target_mth || 0,
              elapsed_days: elapsedDays,
              total_days: totalDays,
            },
            section2: {
              sellthrough_rate: section2Data.header?.overall_sellthrough || 0,
              sales_amt: section2Data.header?.total_sales || 0,
              inbound_amt: section2Data.header?.total_inbound || 0,
              sales_yoy_pct: section2Data.header?.sales_yoy_pct || 100,
            },
            section3: {
              sellthrough_rate: ((section3Data.header?.base_stock_amt || 0) - (section3Data.header?.curr_stock_amt || 0)) / (section3Data.header?.base_stock_amt || 1) * 100,
              base_stock_amt: section3Data.header?.base_stock_amt || 0,
              curr_stock_amt: section3Data.header?.curr_stock_amt || 0,
              stagnant_ratio: section3Data.header?.curr_stock_amt > 0 
                ? ((section3Data.header?.stagnant_stock_amt || 0) / section3Data.header.curr_stock_amt * 100)
                : 0,
            }
          })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch executive summary');
        }

        const data = await response.json();
        setSummary(data);
      } catch (err: any) {
        console.error('❌ Executive summary fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, [region, brand, date, section1Data, section2Data, section3Data, preloadedSummary, preloadedError]);

  // 로딩 중일 때 스켈레톤 UI
  if (loading || parentLoading) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-md p-6 border-l-4 border-orange-500 mb-6">
        {/* 주요내용 스켈레톤 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">📊</span>
          <h3 className="text-lg font-bold text-gray-900">
            {t(language, 'executiveSummaryTitle')}
          </h3>
        </div>
        <div className="space-y-2 mb-5">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-11/12"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-10/12"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
        </div>

        {/* 핵심인사이트 스켈레톤 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">💡</span>
          <h3 className="text-lg font-bold text-gray-900">
            {t(language, 'keyInsightsTitle')}
          </h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <div className="h-3 bg-gray-200 rounded animate-pulse flex-1"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 에러 발생 시
  if (error) {
    return (
      <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg shadow-md p-6 border-l-4 border-red-500 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">⚠️</span>
          <h3 className="text-lg font-bold text-gray-900">
            {language === 'ko' ? '요약 생성 실패' : 'Summary Generation Failed'}
          </h3>
        </div>
        <p className="text-sm text-gray-700">
          {language === 'ko'
            ? '경영 요약을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            : 'An error occurred while generating the executive summary. Please try again later.'}
        </p>
        <p className="text-xs text-gray-500 mt-2">{error}</p>
      </div>
    );
  }

  // 데이터가 없을 때
  if (!summary) {
    return null;
  }

  const handleRegenerate = async () => {
    if (!confirm(language === 'ko' ? '편집 내용을 삭제하고 AI가 새로 생성하게 하시겠습니까?' : 'Delete edited content and regenerate with AI?')) {
      return;
    }

    setRegenerating(true);

    try {
      // 1. Redis에서 편집 데이터 삭제
      const deleteResponse = await fetch(`/api/insights/summary/edit?region=${region}&brand=${brand}&date=${date}`, {
        method: 'DELETE',
      });

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete edited summary');
      }

      // 2. AI 재생성 요청
      // 경과일수 계산
      const asofDate = new Date(date);
      const elapsedDays = asofDate.getDate();
      const year = asofDate.getFullYear();
      const month = asofDate.getMonth();
      const totalDays = new Date(year, month + 1, 0).getDate();

      const response = await fetch('/api/insights/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          brand,
          asof_date: date,
          skip_cache: true,
          section1: {
            // AI 요약은 항상 당월(MTD) 데이터 사용
            achievement_rate: section1Data.total_subtotal?.progress || 0,
            yoy_ytd: section1Data.total_subtotal?.yoy || 0,
            actual_sales_ytd: section1Data.total_subtotal?.mtd_act || 0,
            target_ytd: section1Data.total_subtotal?.target_mth || 0,
            elapsed_days: elapsedDays,
            total_days: totalDays,
          },
          section2: {
            sellthrough_rate: section2Data.header?.overall_sellthrough || 0,
            sales_amt: section2Data.header?.total_sales || 0,
            inbound_amt: section2Data.header?.total_inbound || 0,
            sales_yoy_pct: section2Data.header?.sales_yoy_pct || 100,
          },
          section3: {
            sellthrough_rate: section3Data.header?.base_stock_amt > 0 
              ? ((section3Data.header.base_stock_amt - section3Data.header.curr_stock_amt) / section3Data.header.base_stock_amt * 100)
              : 0,
            base_stock_amt: section3Data.header?.base_stock_amt || 0,
            curr_stock_amt: section3Data.header?.curr_stock_amt || 0,
            stagnant_ratio: section3Data.header?.curr_stock_amt > 0 
              ? ((section3Data.header?.stagnant_stock_amt || 0) / section3Data.header.curr_stock_amt * 100)
              : 0,
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate summary');
      }

      const data = await response.json();
      console.log('✅ Summary regenerated:', data);
      
      setSummary(data);
      setRegenerating(false);
      manuallyEditedRef.current = false;
      prevPreloadedSummaryRef.current = data;
      
      if (onSummaryUpdated) {
        onSummaryUpdated(data);
      }
    } catch (err: any) {
      console.error('❌ Regenerate error:', err);
      alert(language === 'ko' ? '재생성 중 오류가 발생했습니다.' : 'Failed to regenerate.');
      setRegenerating(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-md p-6 border-l-4 border-orange-500 mb-6">
      {/* 헤더 (제목 + AI 재생성 버튼) */}
      <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <h3 className="text-lg font-bold text-gray-900">
              {t(language, 'executiveSummaryTitle')}
            </h3>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {regenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {language === 'ko' ? '재생성 중...' : 'Regenerating...'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {language === 'ko' ? 'AI 재생성' : 'Regenerate AI'}
              </>
            )}
          </button>
        </div>

        {/* 주요내용 */}
        <div className="mb-5">
          <p key={summary.main_summary} className="text-base text-gray-800 leading-relaxed whitespace-pre-line">
            {summary.main_summary}
          </p>
        </div>

        {/* 핵심인사이트 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">💡</span>
            <h3 className="text-lg font-bold text-gray-900">
              {t(language, 'keyInsightsTitle')}
            </h3>
          </div>
          <ul className="space-y-2">
            {summary.key_insights.map((insight, index) => (
              <li key={`${insight}-${index}`} className="flex items-start gap-2">
                <span className="text-orange-500 font-bold mt-0.5">•</span>
                <span className="text-sm text-gray-800 leading-relaxed flex-1">
                  {insight}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
  );
}
