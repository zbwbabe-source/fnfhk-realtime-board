'use client';

import { useState, useEffect } from 'react';

interface Section2Props {
  region: string;
  brand: string;
  date: string;
}

interface ProductRow {
  prdt_cd: string;
  category: string;
  inbound_tag: number;
  sales_tag: number;
  sellthrough: number;
}

interface NoInboundRow {
  prdt_cd: string;
  category: string;
  sales_tag: number;
}

export default function Section2SellThrough({ region, brand, date }: Section2Props) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expanded || !date) return;

    async function fetchData() {
      setLoading(true);
      setError('');
      
      try {
        const res = await fetch(
          `/api/section2/sellthrough?region=${region}&brand=${brand}&date=${date}`
        );
        
        if (!res.ok) {
          throw new Error('Failed to fetch data');
        }
        
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        console.error('Section2 fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [expanded, region, brand, date]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(num);
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(2)}%`;
  };

  const renderProductRow = (row: ProductRow) => (
    <tr key={row.prdt_cd}>
      <td className="px-4 py-2 border-b border-gray-200">{row.prdt_cd}</td>
      <td className="px-4 py-2 border-b border-gray-200">{row.category}</td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.inbound_tag)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.sales_tag)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right font-medium">
        {formatPercent(row.sellthrough)}
      </td>
    </tr>
  );

  const renderNoInboundRow = (row: NoInboundRow) => (
    <tr key={row.prdt_cd}>
      <td className="px-4 py-2 border-b border-gray-200">{row.prdt_cd}</td>
      <td className="px-4 py-2 border-b border-gray-200">{row.category}</td>
      <td className="px-4 py-2 border-b border-gray-200 text-right text-red-600">
        {formatNumber(row.sales_tag)}
      </td>
    </tr>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header - Collapsible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-gray-900">
          섹션 2: 당시즌 판매율 (TAG 기준)
        </h2>
        <svg
          className={`w-5 h-5 text-gray-600 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6 border-t border-gray-200">
          {loading && (
            <div className="text-center py-8 text-gray-600">Loading...</div>
          )}

          {error && (
            <div className="text-center py-8 text-red-600">
              Error: {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6 mt-4">
              {/* Header Info */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-600">시즌:</span>
                    <span className="ml-2 text-lg font-semibold text-gray-900">
                      {data.header.sesn}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">전체 판매율:</span>
                    <span className="ml-2 text-lg font-semibold text-blue-600">
                      {data.header.overall_sellthrough.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* TOP 10 */}
              <div>
                <h3 className="text-md font-semibold text-gray-900 mb-2">
                  TOP 10 (판매율 높은 순)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">품번</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">카테고리</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">입고(TAG)</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">판매(TAG)</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">판매율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top10.map((row: ProductRow) => renderProductRow(row))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BAD 10 */}
              <div>
                <h3 className="text-md font-semibold text-gray-900 mb-2">
                  BAD 10 (판매율 낮은 순)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">품번</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">카테고리</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">입고(TAG)</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">판매(TAG)</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">판매율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bad10.map((row: ProductRow) => renderProductRow(row))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* No Inbound */}
              {data.no_inbound && data.no_inbound.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-2">
                    입고 없음 (No Inbound)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-yellow-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-700">품번</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-700">카테고리</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-700">판매(TAG)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.no_inbound.map((row: NoInboundRow) => renderNoInboundRow(row))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
