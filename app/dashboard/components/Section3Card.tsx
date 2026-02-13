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

  // Section3 KPI 계산
  const calculateKPIs = () => {
    if (!section3Data?.header) {
      return {
        k1: { label: t(language, 'currentStock'), value: 'N/A', subValue: null, subColor: '' },
        k2: { label: t(language, 'depletedStock'), value: 'N/A', subValue: null, subColor: '' },
        k3: { label: t(language, 'stagnantRatio'), value: 'N/A', subValue: null, subColor: '' },
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

    // 정체재고비중 증가는 부정적 (red), 감소는 긍정적 (green)
    const ratioChangeColor = stagnantRatioChange > 0 ? 'text-red-600' : stagnantRatioChange < 0 ? 'text-green-600' : 'text-gray-600';
    const ratioChangeArrow = stagnantRatioChange > 0 ? '▲ ' : stagnantRatioChange < 0 ? '▼ ' : '';

    // 당월 기간 계산 (예: "2/1~2/12")
    let currentMonthPeriod = '';
    if (section3Data?.asof_date) {
      const asofDate = new Date(section3Data.asof_date);
      const month = asofDate.getMonth() + 1;
      const day = asofDate.getDate();
      currentMonthPeriod = `${month}/1~${month}/${day}`;
    }

    return {
      k1: {
        label: t(language, 'currentStock'),
        value: formatCurrency(currentStock),
        subValue: null,  // 하단 표시 제거
        subColor: '',
      },
      k2: {
        label: t(language, 'depletedStock'),
        value: formatCurrency(depletedStock),
        subValue: currentMonthDepleted > 0 
          ? `${t(language, 'currentMonthOnly')}(${currentMonthPeriod}): ${formatCurrency(currentMonthDepleted)}` 
          : null,
        subColor: 'text-blue-600',
      },
      k3: {
        label: t(language, 'stagnantRatio'),
        value: `${stagnantRatio.toFixed(1)}%`,
        subValue: stagnantRatioChange !== 0 
          ? `${ratioChangeArrow}${Math.abs(stagnantRatioChange).toFixed(1)}%p (${t(language, 'vsLastMonthEnd')})` 
          : null,
        subColor: ratioChangeColor,
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
            <div className={`text-xs font-medium mt-0.5 ${kpis.k1.subColor}`}>
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
            <div className={`text-xs font-medium mt-0.5 ${kpis.k2.subColor}`}>
              {kpis.k2.subValue}
            </div>
          )}
        </div>

        {/* K3 */}
        <div>
          <div className="text-xs text-gray-600 mb-1">{kpis.k3.label}</div>
          <div className="text-xl font-bold text-gray-900">{kpis.k3.value}</div>
          {kpis.k3.subValue && (
            <div className={`text-xs font-medium mt-0.5 ${kpis.k3.subColor}`}>
              {kpis.k3.subValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
