'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section2CardProps {
  section2Data: any;
  language: Language;
}

interface Insight {
  status: 'green' | 'yellow' | 'red';
  insight: string;
}

export default function Section2Card({ section2Data, language }: Section2CardProps) {
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

  const getSection2Season = () => {
    if (!section2Data?.header?.sesn) return '';
    return section2Data.header.sesn;
  };

  // Section2 KPI 계산
  const calculateKPIs = () => {
    if (!section2Data?.header) {
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

    return {
      k1: {
        label: t(language, 'sellRate'),
        value: `${sellthrough.toFixed(1)}%`,
      },
      k2: {
        label: t(language, 'cumulativeSales'),
        value: formatCurrency(totalSales),
      },
      k3: {
        label: t(language, 'cumulativeInbound'),
        value: formatCurrency(totalInbound),
      },
    };
  };

  const kpis = calculateKPIs();
  const season = getSection2Season();

  // AI 인사이트 가져오기
  useEffect(() => {
    if (!section2Data?.header) return;

    const fetchInsight = async () => {
      setLoadingInsight(true);
      try {
        const header = section2Data.header;
        const response = await fetch('/api/insights/section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: '2',
            data: {
              sellthrough_rate: header.overall_sellthrough || 0,
              sales_amt: header.total_sales || 0,
              inbound_amt: header.total_inbound || 0,
              sales_yoy_pct: header.sales_yoy_pct || 100,
            },
            language,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setInsight(data);
        } else {
          setInsight(null);
        }
      } catch (error) {
        console.error('Failed to fetch Section2 insight:', error);
        setInsight(null);
      } finally {
        setLoadingInsight(false);
      }
    };

    fetchInsight();
  }, [section2Data, language]);

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
    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg shadow-md p-6 border-l-4 border-green-600">
      {/* 제목 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📊</span>
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {t(language, 'section2Title')}
            {season && <span className="ml-2 text-sm text-purple-600">({season})</span>}
          </h3>
          <p className="text-xs text-gray-600">{t(language, 'section2Subtitle')}</p>
        </div>
      </div>

      {/* KPI 그리드 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* K1 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k1.label}</div>
          <div className="text-xl font-bold text-green-600">{kpis.k1.value}</div>
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
        <div className="mt-3 p-3 bg-gray-100 rounded-lg border border-gray-300">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{language === 'ko' ? '분석 중...' : 'Analyzing...'}</span>
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
