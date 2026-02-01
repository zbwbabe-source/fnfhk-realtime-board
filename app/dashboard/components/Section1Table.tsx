'use client';

import { useState, useEffect } from 'react';

interface Section1TableProps {
  region: string;
  brand: string;
  date: string;
}

interface StoreRow {
  shop_cd: string;
  shop_name: string;
  country: string;
  channel: string;
  target_mth: number;
  mtd_act: number;
  mtd_act_py: number;
  yoy: number;
  progress: number;
  forecast: number | null;
}

export default function Section1Table({ region, brand, date }: Section1TableProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!date) return;

    async function fetchData() {
      setLoading(true);
      setError('');
      
      try {
        const res = await fetch(
          `/api/section1/store-sales?region=${region}&brand=${brand}&date=${date}`
        );
        
        if (!res.ok) {
          throw new Error('Failed to fetch data');
        }
        
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        console.error('Section1 fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          섹션 1: 매장별 매출 (ACT)
        </h2>
        <div className="text-center py-8 text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          섹션 1: 매장별 매출 (ACT)
        </h2>
        <div className="text-center py-8 text-red-600">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(num);
  };

  const formatPercent = (num: number) => {
    return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  const renderRow = (row: StoreRow, isSubtotal = false) => (
    <tr key={row.shop_cd} className={isSubtotal ? 'bg-blue-50 font-semibold' : ''}>
      <td className="px-4 py-2 border-b border-gray-200">{row.shop_name}</td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.target_mth)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.mtd_act)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.mtd_act_py)}
      </td>
      <td className={`px-4 py-2 border-b border-gray-200 text-right ${
        row.yoy >= 0 ? 'text-green-600' : 'text-red-600'
      }`}>
        {formatPercent(row.yoy)}
      </td>
    </tr>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        섹션 1: 매장별 매출 (ACT 기준, Warehouse 제외)
      </h2>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">매장</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">목표(월)</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">MTD 실적</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">MTD 전년</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">YoY</th>
            </tr>
          </thead>
          <tbody>
            {/* HK 정상 */}
            {data.hk_normal && data.hk_normal.length > 0 && (
              <>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                    HK - 정상
                  </td>
                </tr>
                {data.hk_normal.map((row: StoreRow) => renderRow(row))}
              </>
            )}

            {/* HK 아울렛 */}
            {data.hk_outlet && data.hk_outlet.length > 0 && (
              <>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                    HK - 아울렛
                  </td>
                </tr>
                {data.hk_outlet.map((row: StoreRow) => renderRow(row))}
              </>
            )}

            {/* HK 온라인 */}
            {data.hk_online && data.hk_online.length > 0 && (
              <>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                    HK - 온라인
                  </td>
                </tr>
                {data.hk_online.map((row: StoreRow) => renderRow(row))}
              </>
            )}

            {/* MC 소계 */}
            {data.mc_subtotal && (
              <>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-2 font-medium text-gray-700">
                    MC
                  </td>
                </tr>
                {renderRow(data.mc_subtotal, true)}
              </>
            )}

            {/* HKMC 전체 소계 */}
            {data.total_subtotal && (
              <>
                <tr className="h-2"></tr>
                {renderRow(data.total_subtotal, true)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
