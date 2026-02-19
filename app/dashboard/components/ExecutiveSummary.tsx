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

  // preloaded 데이터가 없으면 fetch하지 않음 (부모에서 로딩 보장)
  // 모든 summary 로딩은 부모(page.tsx)에서 처리
  useEffect(() => {
    if (!preloadedSummary && !preloadedError) {
      console.log('⚠️ ExecutiveSummary mounted without preloaded data - waiting for parent');
    }
  }, [preloadedSummary, preloadedError]);

  // 로딩 중일 때 스켈레톤 UI
  if (loading || parentLoading) {
    return (
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between">
          <h3 className="text-xl font-bold text-gray-900">Executive Insight</h3>
          <div className="text-xs text-gray-400">Loading...</div>
        </div>
        <div className="space-y-4">
          <div className="h-6 w-full animate-pulse rounded bg-gray-100"></div>
          <div className="h-4 w-11/12 animate-pulse rounded bg-gray-100"></div>
          <div className="h-4 w-10/12 animate-pulse rounded bg-gray-100"></div>
        </div>
      </div>
    );
  }

  // 에러 발생 시
  if (error) {
    return (
      <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-bold text-red-900">
          {language === 'ko' ? 'Insight 생성 실패' : 'Insight Generation Failed'}
        </h3>
        <p className="text-sm text-red-700">{error}</p>
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
      
      console.log('📅 [Regenerate] Date calculation:', {
        date,
        asofDate: asofDate.toISOString(),
        elapsedDays,
        totalDays,
        formula: `${elapsedDays}일 / ${totalDays}일`
      });

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
            prev_month_stagnant_ratio: section3Data.header?.prev_month_stagnant_ratio || 0,
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
    <div className="mb-6 rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between border-b border-gray-100 pb-4">
        <h3 className="text-xl font-bold text-gray-900">Executive Insight</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400">
            {date} | {brand} | {isYtdMode ? 'YTD' : 'MTD'}
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {regenerating ? (
              <>
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{language === 'ko' ? '재생성 중...' : 'Regenerating...'}</span>
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{language === 'ko' ? 'AI 재생성' : 'Regenerate'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Core Summary */}
      <div className="mb-6 rounded-lg bg-purple-50 p-4">
        <p className="text-base font-semibold leading-relaxed text-gray-900">
          {summary.main_summary}
        </p>
      </div>

      {/* Key Insights */}
      <div className="space-y-4">
        {summary.key_insights.map((insight, index) => (
          <div key={`${insight}-${index}`} className="flex items-start gap-3">
            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500"></div>
            <p className="text-sm leading-relaxed text-gray-700">{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
