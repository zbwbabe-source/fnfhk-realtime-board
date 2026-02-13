'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section2CardProps {
  section2Data: any;
  language: Language;
  categoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
  region: string;
}

export default function Section2Card({ section2Data, language, categoryFilter, onCategoryFilterChange, region }: Section2CardProps) {
  // 디버깅용 로그
  console.log('Section2Card received data:', {
    total_sales: section2Data?.header?.total_sales,
    total_inbound: section2Data?.header?.total_inbound,
    sellthrough: section2Data?.header?.overall_sellthrough,
  });

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
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg shadow-md p-6 border-l-4 border-green-600">
      {/* 제목 및 필터 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">
                {categoryFilter === 'clothes' ? t(language, 'section2HeaderClothes') : t(language, 'section2HeaderAll')}
                {season && <span className="ml-2 text-sm text-purple-600">({season})</span>}
                <span className="ml-2 text-xs text-gray-500">{t(language, 'tagBasis')}</span>
              </h3>
            </div>
            <p className="text-xs text-gray-600">{t(language, 'section2Subtitle')}</p>
            <p className="text-xs text-gray-500">{currencyUnit}</p>
          </div>
        </div>
        
        {/* 카테고리 필터 토글 버튼 */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">{t(language, 'filterCategory')}</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-2.5 py-1 text-xs font-medium rounded-l-lg transition-colors ${
                categoryFilter === 'clothes'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-r-lg transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>
      </div>

      {/* KPI 그리드 */}
      <div className="grid grid-cols-3 gap-4">
        {/* K1 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k1.label}</div>
          <div className="text-xl font-bold text-green-600">{kpis.k1.value}</div>
          <div className="h-5"></div> {/* 섹션3 높이 맞춤용 빈 공간 */}
        </div>

        {/* K2 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k2.label}</div>
          <div className="text-xl font-bold text-gray-900">{kpis.k2.value}</div>
          <div className="h-5"></div> {/* 섹션3 높이 맞춤용 빈 공간 */}
        </div>

        {/* K3 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k3.label}</div>
          <div className="text-xl font-bold text-gray-900">{kpis.k3.value}</div>
          <div className="h-5"></div> {/* 섹션3 높이 맞춤용 빈 공간 */}
        </div>
      </div>
    </div>
  );
}
