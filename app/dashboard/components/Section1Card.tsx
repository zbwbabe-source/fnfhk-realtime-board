'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section1CardProps {
  isYtdMode: boolean;
  section1Data: any;
  language: Language;
}

interface Insight {
  status: 'green' | 'yellow' | 'red';
  insight: string;
}

export default function Section1Card({ isYtdMode, section1Data, language }: Section1CardProps) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const formatCurrency = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
  };

  // Section1 KPI 계산
  const calculateKPIs = () => {
    if (!section1Data?.total_subtotal) {
      return {
        k1: { label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual'), value: 'N/A' },
        k2: { label: t(language, 'yoy'), value: 'N/A' },
        k3: { label: t(language, 'progress'), value: 'N/A' },
      };
    }

    const total = section1Data.total_subtotal;
    
    if (isYtdMode) {
      if (typeof total.ytd_act === 'undefined' || total.ytd_act === null) {
        return {
          k1: { label: t(language, 'ytdActual'), value: 'N/A' },
          k2: { label: t(language, 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    } else {
      if (typeof total.mtd_act === 'undefined' || total.mtd_act === null) {
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

    return {
      k1: {
        label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual'),
        value: formatCurrency(actual),
      },
      k2: {
        label: t(language, 'yoy'),
        value: `${yoy.toFixed(1)}%`,
      },
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
      },
    };
  };

  const kpis = calculateKPIs();

  // AI 인사이트 가져오기 (데이터가 완전히 로드된 후에만)
  useEffect(() => {
    // 데이터가 없거나 유효하지 않으면 스킵
    if (!section1Data?.total_subtotal) {
      setInsight(null);
      return;
    }

    const total = section1Data.total_subtotal;
    
    // 필수 데이터가 없으면 스킵
    if (typeof total.ytd_act === 'undefined' || 
        typeof total.ytd_target === 'undefined' || 
        typeof total.progress_ytd === 'undefined' ||
        typeof total.yoy_ytd === 'undefined') {
      setInsight(null);
      return;
    }

    const fetchInsight = async () => {
      setLoadingInsight(true);
      try {
        const response = await fetch('/api/insights/section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: '1',
            data: {
              actual_sales_ytd: total.ytd_act,
              target_ytd: total.ytd_target,
              achievement_rate: total.progress_ytd,
              yoy_ytd: total.yoy_ytd,
            },
            language,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setInsight(data);
        } else {
          // 에러 시 인사이트를 표시하지 않음
          setInsight(null);
        }
      } catch (error) {
        console.error('Failed to fetch Section1 insight:', error);
        // 에러 시 인사이트를 표시하지 않음
        setInsight(null);
      } finally {
        setLoadingInsight(false);
      }
    };

    fetchInsight();
  }, [section1Data, language]);

  // 신호등 색상
  const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
    if (status === 'green') return 'bg-green-100 border-green-500';
    if (status === 'yellow') return 'bg-yellow-100 border-yellow-500';
    return 'bg-red-100 border-red-500';
  };

  const getStatusIcon = (status: 'green' | 'yellow' | 'red') => {
    if (status === 'green') return '🟢';
    if (status === 'yellow') return '🟡';
    return '🔴';
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg shadow-md p-6 border-l-4 border-blue-600">
      {/* 제목 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">💼</span>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{t(language, 'section1Title')}</h3>
          <p className="text-xs text-gray-600">{t(language, 'section1Subtitle')}</p>
        </div>
      </div>

      {/* KPI 그리드 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* K1 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k1.label}</div>
          <div className="text-xl font-bold text-blue-600">{kpis.k1.value}</div>
        </div>

        {/* K2 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k2.label}</div>
          <div className="text-xl font-bold text-gray-900">{kpis.k2.value}</div>
        </div>

        {/* K3 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k3.label}</div>
          <div className="text-xl font-bold text-gray-900">{kpis.k3.value}</div>
        </div>
      </div>

      {/* AI 인사이트 */}
      {loadingInsight ? (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{language === 'ko' ? '인사이트 분석 중...' : 'Analyzing insights...'}</span>
          </div>
        </div>
      ) : insight ? (
        <div className={`mt-3 p-3 rounded-lg border-l-4 ${getStatusColor(insight.status)}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg flex-shrink-0">{getStatusIcon(insight.status)}</span>
            <p className="text-xs text-gray-700 leading-relaxed">{insight.insight}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
