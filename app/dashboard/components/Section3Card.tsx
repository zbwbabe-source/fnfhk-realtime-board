'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section3CardProps {
  section3Data: any;
  language: Language;
  region: string;
}

export default function Section3Card({ section3Data, language, region }: Section3CardProps) {
  const formatCurrency = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
  };

  const getSection3SeasonType = () => {
    if (!section3Data?.season_type) return '';
    const seasonType = section3Data.season_type;
    return `${seasonType} ${t(language, 'oldSeason')}`;
  };

  // Section3 KPI 계산
  const calculateKPIs = () => {
    if (!section3Data?.header) {
      return {
        k1: { label: t(language, 'currentStock'), value: 'N/A' },
        k2: { label: t(language, 'depletedStock'), value: 'N/A' },
        k3: { label: t(language, 'stagnantRatio'), value: 'N/A' },
      };
    }

    const header = section3Data.header;
    const currentStock = header.curr_stock_amt || 0;
    const depletedStock = header.depleted_stock_amt || 0;
    const stagnantStock = header.stagnant_stock_amt || 0;
    const stagnantRatio = currentStock > 0 ? (stagnantStock / currentStock) * 100 : 0;

    return {
      k1: {
        label: t(language, 'currentStock'),
        value: formatCurrency(currentStock),
      },
      k2: {
        label: t(language, 'depletedStock'),
        value: formatCurrency(depletedStock),
      },
      k3: {
        label: t(language, 'stagnantRatio'),
        value: `${stagnantRatio.toFixed(1)}%`,
      },
    };
  };

  const kpis = calculateKPIs();
  const seasonType = getSection3SeasonType();
  const currencyUnit = region === 'TW' ? t(language, 'unitWithExchange') : t(language, 'unit');

  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-100 rounded-lg shadow-md p-6 border-l-4 border-orange-600">
      {/* 제목 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📦</span>
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {t(language, 'section3Title')}
            {seasonType && <span className="ml-2 text-sm text-purple-600">({seasonType})</span>}
          </h3>
          <p className="text-xs text-gray-600">{t(language, 'section3Subtitle')}</p>
          <p className="text-xs text-gray-500 mt-1">{currencyUnit}</p>
        </div>
      </div>

      {/* KPI 그리드 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* K1 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k1.label}</div>
          <div className="text-xl font-bold text-orange-600">{kpis.k1.value}</div>
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
