'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';
import { useTTS } from '../hooks/useTTS';

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
  preloadedError
}: ExecutiveSummaryProps) {
  // preloaded 데이터가 있으면 그것을 사용, 없으면 기존 로직 사용
  const [summary, setSummary] = useState<SummaryData | null>(preloadedSummary || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(preloadedError || '');

  // TTS Hook
  const { speak, stop, isPlaying, isLoading: ttsLoading } = useTTS({
    language,
    onError: (error) => {
      console.error('TTS Error:', error);
      alert(language === 'ko' ? '음성 재생에 실패했습니다.' : 'Voice playback failed.');
    }
  });

  // 음성으로 읽을 텍스트 생성
  const getSpeechText = () => {
    if (!summary) return '';
    
    const intro = language === 'ko' 
      ? '주요 내용입니다. ' 
      : 'Here is the executive summary. ';
    
    const keyInsightsIntro = language === 'ko'
      ? ' 핵심 인사이트입니다. '
      : ' Key insights. ';
    
    const insights = summary.key_insights
      .map((insight, idx) => `${idx + 1}. ${insight}`)
      .join(' ');
    
    return intro + summary.main_summary + keyInsightsIntro + insights;
  };

  const handleTTSClick = () => {
    if (isPlaying) {
      stop();
    } else {
      const text = getSpeechText();
      speak(text);
    }
  };

  // preloaded 데이터가 업데이트되면 state에 반영
  useEffect(() => {
    if (preloadedSummary) {
      setSummary(preloadedSummary);
      setError('');
    }
    if (preloadedError) {
      setError(preloadedError);
    }
  }, [preloadedSummary, preloadedError]);

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

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-md p-6 border-l-4 border-orange-500 mb-6">
      {/* 헤더와 TTS 버튼 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <h3 className="text-lg font-bold text-gray-900">
            {t(language, 'executiveSummaryTitle')}
          </h3>
        </div>
        
        {/* 음성 읽기 버튼 */}
        <button
          onClick={handleTTSClick}
          disabled={ttsLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          title={language === 'ko' ? '음성으로 듣기' : 'Listen'}
        >
          {ttsLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span className="text-sm">
                {language === 'ko' ? '생성 중...' : 'Loading...'}
              </span>
            </>
          ) : isPlaying ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium">
                {language === 'ko' ? '정지' : 'Stop'}
              </span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" />
              </svg>
              <span className="text-sm font-medium">
                {language === 'ko' ? '🎙️ 음성으로 듣기' : '🎙️ Listen'}
              </span>
            </>
          )}
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
  );
}
