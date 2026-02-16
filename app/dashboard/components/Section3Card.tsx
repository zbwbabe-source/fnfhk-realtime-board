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

  const getPeriodStartInfo = () => {
    if (!section3Data?.season_type) return '';
    const seasonType = section3Data.season_type;
    if (seasonType === 'FW') {
      return language === 'ko' ? '(10/1~)' : '(from 10/1)';
    } else if (seasonType === 'SS') {
      return language === 'ko' ? '(3/1~)' : '(from 3/1)';
    }
    return '';
  };

  const metricTone = (v: number, pivot = 0) => {
    if (v > pivot) return 'text-red-700 bg-red-50';  // 정체재고 증가는 부정적
    if (v < pivot) return 'text-green-700 bg-green-50';  // 정체재고 감소는 긍정적
    return 'text-gray-700 bg-gray-100';
  };

  // Section3 KPI 계산
  const calculateKPIs = () => {
    if (!section3Data?.header) {
      return {
        k1: { label: t(language, 'currentStock'), value: 'N/A', subValue: null, subClass: '' },
        k2: { label: t(language, 'depletedStock'), value: 'N/A', subValue: null, subClass: '' },
        k3: { label: t(language, 'stagnantRatio'), value: 'N/A', subValue: null, subClass: '' },
      };
    }

    const header = section3Data.header;
    const currentStock = header.curr_stock_amt || 0;
    const depletedStock = header.depleted_stock_amt || 0;
    const currentMonthDepleted = header.current_month_depleted || 0;
    const stagnantStock = header.stagnant_stock_amt || 0;
    const stagnantRatio = currentStock > 0 ? (stagnantStock / currentStock) * 100 : 0;
    const prevMonthStagnantRatio = (header.prev_month_stagnant_ratio || 0) * 100;
    const stagnantRatioChange = stagnantRatio - prevMonthStagnantRatio;

    // 당월 기간 계산 (예: "2/1~2/12")
    let currentMonthPeriod = '';
    if (section3Data?.asof_date) {
      const asofDate = new Date(section3Data.asof_date);
      const month = asofDate.getMonth() + 1;
      const day = asofDate.getDate();
      currentMonthPeriod = `${month}/1~${month}/${day}`;
    }

    const formatSubValue = (change: number) => {
      const sign = change > 0 ? '+' : '';
      return `${sign}${change.toFixed(1)}%p`;
    };

    return {
      k1: {
        label: t(language, 'currentStock'),
        value: formatCurrency(currentStock),
        subValue: null,
        subClass: '',
      },
      k2: {
        label: t(language, 'depletedStock'),
        value: formatCurrency(depletedStock),
        subValue: currentMonthDepleted > 0 
          ? `${t(language, 'currentMonthOnly')} ${formatCurrency(currentMonthDepleted)}` 
          : null,
        subClass: 'text-blue-700 bg-blue-50',
      },
      k3: {
        label: t(language, 'stagnantRatio'),
        value: `${stagnantRatio.toFixed(1)}%`,
        subValue: stagnantRatioChange !== 0 
          ? formatSubValue(stagnantRatioChange)
          : null,
        subClass: metricTone(stagnantRatioChange, 0),
      },
    };
  };

  const kpis = calculateKPIs();
  const seasonType = getSection3SeasonType();
  const periodStartInfo = getPeriodStartInfo();
  const currencyUnit = region === 'TW' ? t(language, 'cardUnitWithExchange') : t(language, 'cardUnit');

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
          {kpis.k1.subValue && (
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${kpis.k1.subClass}`}>
              {kpis.k1.subValue}
            </div>
          )}
        </div>

        {/* K2 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">
            {kpis.k2.label}
            {periodStartInfo && <span className="ml-1 text-blue-600">{periodStartInfo}</span>}
          </div>
          <div className="text-xl font-bold text-gray-900">{kpis.k2.value}</div>
          {kpis.k2.subValue && (
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${kpis.k2.subClass}`}>
              {kpis.k2.subValue}
            </div>
          )}
        </div>

        {/* K3 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k3.label}</div>
          <div className="text-xl font-bold text-gray-900">{kpis.k3.value}</div>
          {kpis.k3.subValue && (
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${kpis.k3.subClass}`}>
              {kpis.k3.subValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
