'use client';

import { t, type Language } from '@/lib/translations';

interface Section2CardProps {
  section2Data: any;
  language: Language;
}

export default function Section2Card({ section2Data, language }: Section2CardProps) {
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
      <div className="grid grid-cols-3 gap-4">
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
    </div>
  );
}
