'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section1CardProps {
  isYtdMode: boolean;
  section1Data: any;
  language: Language;
}

export default function Section1Card({ isYtdMode, section1Data, language }: Section1CardProps) {

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
    </div>
  );
}
