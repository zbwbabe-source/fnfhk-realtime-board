'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';
import ExecutiveSummaryEditModal from './ExecutiveSummaryEditModal';

interface ExecutiveSummaryProps {
  region: string;
  brand: string;
  date: string;
  language: Language;
  section1Data: any;
  section2Data: any;
  section3Data: any;
  isLoading: boolean;
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
  preloadedSummary,
  preloadedError,
  onSummaryUpdated
}: ExecutiveSummaryProps) {
  // preloaded 데이터가 있으면 그것을 사용, 없으면 기존 로직 사용
  const [summary, setSummary] = useState<SummaryData | null>(preloadedSummary || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(preloadedError || '');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEdited, setIsEdited] = useState(false);

  // preloaded 데이터가 업데이트되면 state에 반영
  useEffect(() => {
    if (preloadedSummary) {
      setSummary(preloadedSummary);
      setError('');
      // 편집된 데이터인지 확인
      checkIfEdited();
    }
    if (preloadedError) {
      setError(preloadedError);
    }
  }, [preloadedSummary, preloadedError]);

  // 편집된 데이터인지 확인
  const checkIfEdited = async () => {
    try {
      const response = await fetch(
        `/api/insights/summary/edit?region=${region}&brand=${brand}&date=${date}`
      );
      const data = await response.json();
      setIsEdited(data.edited || false);
    } catch (err) {
      console.error('Failed to check if edited:', err);
    }
  };

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
        const response = await fetch('/api/insights/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region,
            brand,
            asof_date: date,
            section1: {
              achievement_rate: section1Data.total_subtotal?.progress_ytd || 0,
              yoy_ytd: section1Data.total_subtotal?.yoy_ytd || 0,
              actual_sales_ytd: section1Data.total_subtotal?.ytd_act || 0,
              target_ytd: section1Data.total_subtotal?.ytd_target || 0,
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

  const handleSave = (data: { main_summary: string; key_insights: string[] }) => {
    setSummary(data);
    setIsEdited(true);
    if (onSummaryUpdated) {
      onSummaryUpdated(data);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-md p-6 border-l-4 border-orange-500 mb-6">
        {/* 헤더 (제목 + 편집 버튼) */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <h3 className="text-lg font-bold text-gray-900">
              {t(language, 'executiveSummaryTitle')}
            </h3>
            {isEdited && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                {language === 'ko' ? '편집됨' : 'Edited'}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 bg-white hover:bg-orange-50 border border-orange-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {language === 'ko' ? '편집' : 'Edit'}
          </button>
        </div>

        {/* 주요내용 */}
        <div className="mb-5">
          <p className="text-base text-gray-800 leading-relaxed whitespace-pre-line">
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
              <li key={index} className="flex items-start gap-2">
                <span className="text-orange-500 font-bold mt-0.5">•</span>
                <span className="text-sm text-gray-800 leading-relaxed flex-1">
                  {insight}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 편집 모달 */}
      {summary && (
        <ExecutiveSummaryEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          initialData={summary}
          region={region}
          brand={brand}
          date={date}
          language={language}
          onSave={handleSave}
        />
      )}
    </>
  );
}
