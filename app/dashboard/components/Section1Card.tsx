'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section1CardProps {
  isYtdMode: boolean;
  section1Data: any;
  language: Language;
  brand: string;
  region: string;
  date: string;
  onYtdModeToggle?: () => void;
}

export default function Section1Card({ isYtdMode, section1Data, language, brand, region, date, onYtdModeToggle }: Section1CardProps) {

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
        k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' },
        k3: { label: t(language, 'progress'), value: 'N/A' },
      };
    }

    const total = section1Data.total_subtotal;
    
    if (isYtdMode) {
      if (typeof total.ytd_act === 'undefined' || total.ytd_act === null) {
        return {
          k1: { label: t(language, 'ytdActual'), value: 'N/A' },
          k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    } else {
      if (typeof total.mtd_act === 'undefined' || total.mtd_act === null) {
        return {
          k1: { label: t(language, 'monthlyActual'), value: 'N/A' },
          k2: { label: t(language, brand === 'X' ? 'mom' : 'yoy'), value: 'N/A' },
          k3: { label: t(language, 'progress'), value: 'N/A' },
        };
      }
    }

    const actual = isYtdMode ? total.ytd_act : total.mtd_act;
    // X 브랜드는 MoM, 나머지는 YoY
    const compareRate = brand === 'X' ? (isYtdMode ? total.yoy_ytd : total.mom) : (isYtdMode ? total.yoy_ytd : total.yoy);
    const progress = isYtdMode ? total.progress_ytd : total.progress;
    const discountRate = isYtdMode ? total.discount_rate_ytd : total.discount_rate_mtd;

    // YoY/MoM이 없거나 0일 때 할인율 표시
    const hasCompareRate = compareRate && compareRate !== 0;
    const hasDiscountRate = typeof discountRate === 'number' && !isNaN(discountRate);

    return {
      k1: {
        label: t(language, isYtdMode ? 'ytdActual' : 'monthlyActual'),
        value: formatCurrency(actual),
      },
      k2: {
        label: hasCompareRate 
          ? t(language, brand === 'X' ? 'mom' : 'yoy')
          : (language === 'ko' ? '할인율' : 'Discount Rate'),
        value: hasCompareRate 
          ? `${compareRate.toFixed(0)}%`
          : (hasDiscountRate ? `${discountRate.toFixed(1)}%` : 'N/A'),
      },
      k3: {
        label: t(language, 'progress'),
        value: `${progress.toFixed(1)}%`,
      },
    };
  };

  const kpis = calculateKPIs();
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg shadow-md p-6 border-l-4 border-blue-600">
      {/* 제목 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💼</span>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t(language, 'section1Title')}</h3>
            <p className="text-xs text-gray-600">{t(language, 'section1Subtitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{currencyUnit}</p>
          </div>
        </div>
        
        {/* 연누적 버튼 */}
        {onYtdModeToggle && (
          <div className="flex items-center gap-2">
            <button
              onClick={onYtdModeToggle}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 border whitespace-nowrap ${
                isYtdMode 
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-600 shadow-lg hover:from-blue-600 hover:to-blue-700 ring-2 ring-blue-300 ring-opacity-50' 
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {isYtdMode ? `✓ ${t(language, 'ytdToggle')}` : t(language, 'ytdToggle')}
            </button>
            {isYtdMode && (
              <span className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-1 rounded border border-blue-300">
                {language === 'ko' ? `1/1~${date.slice(5).replace('-', '/')}` : `1/1~${date.slice(5).replace('-', '/')}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI 그리드 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* K1 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k1.label}</div>
          <div className="text-xl font-bold text-blue-600">{kpis.k1.value}</div>
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
