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
  progress: number;
  mtd_act_py: number;
  yoy: number;
  monthEndProjection: number; // 월말환산
  projectedYoY: number; // 환산 YoY
  forecast: number | null;
}

export default function Section1Table({ region, brand, date }: Section1TableProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({
    'hk_normal': false,
    'hk_outlet': false,
    'hk_online': false,
    'mc_normal': false,
    'mc_outlet': false,
    'mc_online': false,
  });
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const toggleChannel = (channel: string) => {
    setExpandedChannels(prev => ({
      ...prev,
      [channel]: !prev[channel]
    }));
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedStores = (stores: StoreRow[]) => {
    if (!sortConfig || !stores) return stores;

    return [...stores].sort((a, b) => {
      // 영업종료 매장(당월실적 0)은 항상 맨 아래로
      const aIsClosed = a.mtd_act === 0;
      const bIsClosed = b.mtd_act === 0;
      
      if (aIsClosed && !bIsClosed) return 1;
      if (!aIsClosed && bIsClosed) return -1;
      
      // 둘 다 영업중이거나 둘 다 폐점인 경우 정렬 기준 적용
      let aValue: any;
      let bValue: any;

      switch (sortConfig.key) {
        case 'shop_name':
          aValue = a.shop_name || a.shop_cd;
          bValue = b.shop_name || b.shop_cd;
          break;
        case 'target_mth':
          aValue = a.target_mth;
          bValue = b.target_mth;
          break;
        case 'mtd_act':
          aValue = a.mtd_act;
          bValue = b.mtd_act;
          break;
        case 'progress':
          aValue = a.progress;
          bValue = b.progress;
          break;
        case 'mtd_act_py':
          aValue = a.mtd_act_py;
          bValue = b.mtd_act_py;
          break;
        case 'yoy':
          aValue = a.yoy;
          bValue = b.yoy;
          break;
        case 'monthEndProjection':
          aValue = a.monthEndProjection;
          bValue = b.monthEndProjection;
          break;
        case 'projectedYoY':
          aValue = a.projectedYoY;
          bValue = b.projectedYoY;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }
    });
  };

  const expandAll = () => {
    setExpandedChannels({
      'hk_normal': true,
      'hk_outlet': true,
      'hk_online': true,
      'mc_normal': true,
      'mc_outlet': true,
      'mc_online': true,
    });
  };

  const collapseAll = () => {
    setExpandedChannels({
      'hk_normal': false,
      'hk_outlet': false,
      'hk_online': false,
      'mc_normal': false,
      'mc_outlet': false,
      'mc_online': false,
    });
  };

  const toggleAll = () => {
    const allExpanded = Object.values(expandedChannels).every(v => v);
    if (allExpanded) {
      collapseAll();
    } else {
      expandAll();
    }
  };

  const isAllExpanded = Object.values(expandedChannels).every(v => v);

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
          섹션 1: 매장별 매출 (실판매출기준, 단위 HKD)
        </h2>
        <div className="text-center py-8 text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          섹션 1: 매장별 매출 (실판매출기준, 단위 HKD)
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
    return `${num.toFixed(1)}%`;
  };

  const renderChannelSection = (
    channelKey: string,
    channelName: string,
    stores: StoreRow[],
    subtotal: StoreRow | null
  ) => {
    if (!stores || stores.length === 0) return null;
    
    const isExpanded = expandedChannels[channelKey];
    const sortedStores = getSortedStores(stores);
    
    return (
      <>
        <tr 
          className="bg-blue-50 font-semibold cursor-pointer hover:bg-blue-100"
          onClick={() => toggleChannel(channelKey)}
        >
          <td className="px-4 py-2 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span>{isExpanded ? '▼' : '▶'}</span>
              <span>{channelName}</span>
              <span className="text-xs text-gray-500 font-normal">({stores.length}개 매장)</span>
            </div>
          </td>
          {subtotal ? (
            <>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotal.target_mth)}
              </td>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotal.mtd_act)}
              </td>
              <td className={`px-4 py-2 border-b border-gray-200 text-right ${
                subtotal.progress < 80 ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatPercent(subtotal.progress)}
              </td>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotal.mtd_act_py)}
              </td>
              <td className={`px-4 py-2 border-b border-gray-200 text-right ${
                subtotal.yoy < 80 ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatPercent(subtotal.yoy)}
              </td>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotal.monthEndProjection)}
              </td>
              <td className={`px-4 py-2 border-b border-gray-200 text-right ${
                subtotal.projectedYoY < 80 ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatPercent(subtotal.projectedYoY)}
              </td>
            </>
          ) : (
            <td colSpan={7} className="px-4 py-2 border-b border-gray-200"></td>
          )}
        </tr>
        {isExpanded && sortedStores.map((row: StoreRow) => renderRow(row))}
      </>
    );
  };

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <span className="text-gray-400 ml-1">⇅</span>;
    }
    return sortConfig.direction === 'asc' 
      ? <span className="ml-1">↑</span> 
      : <span className="ml-1">↓</span>;
  };

  const renderRow = (row: StoreRow, isSubtotal = false) => {
    const isClosed = !isSubtotal && row.mtd_act === 0;
    
    return (
      <tr key={row.shop_cd} className={`${isSubtotal ? 'bg-blue-50 font-semibold' : ''} ${isClosed ? 'bg-gray-100 opacity-60' : ''}`}>
        <td className="px-4 py-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isClosed ? 'text-gray-400' : 'text-gray-500'}`}>{row.shop_cd}</span>
            {row.shop_name && row.shop_name !== row.shop_cd && (
              <>
                <span className={`font-medium text-base ${isClosed ? 'text-gray-400' : ''}`}>{row.shop_name}</span>
                {isClosed && <span className="text-red-500 text-xs">(영업종료)</span>}
              </>
            )}
            {(!row.shop_name || row.shop_name === row.shop_cd) && (
              <>
                <span className={`font-medium text-base ${isClosed ? 'text-gray-400' : ''}`}>{row.shop_cd}</span>
                {isClosed && <span className="text-red-500 text-xs">(영업종료)</span>}
              </>
            )}
          </div>
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(row.target_mth)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(row.mtd_act)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${
          isClosed ? 'text-gray-400' : (row.progress < 80 ? 'text-red-600' : 'text-green-600')
        }`}>
          {formatPercent(row.progress)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(row.mtd_act_py)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${
          isClosed ? 'text-gray-400' : (row.yoy < 80 ? 'text-red-600' : 'text-green-600')
        }`}>
          {formatPercent(row.yoy)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(row.monthEndProjection)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${
          isClosed ? 'text-gray-400' : (row.projectedYoY < 80 ? 'text-red-600' : 'text-green-600')
        }`}>
          {formatPercent(row.projectedYoY)}
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          섹션 1: 매장별 매출 (실판매출기준, 단위 HKD)
        </h2>
        <button
          onClick={toggleAll}
          className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
        >
          <span>{isAllExpanded ? '▼' : '▶'}</span>
          <span>{isAllExpanded ? '전체 접기' : '전체 펼치기'}</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th 
                className="px-4 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('shop_name')}
              >
                <div className="flex items-center">
                  매장
                  {getSortIcon('shop_name')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('target_mth')}
              >
                <div className="flex items-center justify-end">
                  목표(월)
                  {getSortIcon('target_mth')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('mtd_act')}
              >
                <div className="flex items-center justify-end">
                  당월실적
                  {getSortIcon('mtd_act')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('progress')}
              >
                <div className="flex items-center justify-end">
                  목표대비
                  {getSortIcon('progress')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('mtd_act_py')}
              >
                <div className="flex items-center justify-end">
                  전년동월
                  {getSortIcon('mtd_act_py')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('yoy')}
              >
                <div className="flex items-center justify-end">
                  YoY
                  {getSortIcon('yoy')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200 relative group"
                onClick={() => handleSort('monthEndProjection')}
              >
                <div className="flex items-center justify-end">
                  월말환산
                  {getSortIcon('monthEndProjection')}
                  <span className="ml-1 text-xs text-gray-500 cursor-help">ⓘ</span>
                </div>
                <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded py-2 px-3 -top-16 right-0 w-64 z-10 shadow-lg">
                  과거 2개년치 휴일/평일 일별 매출을 근거로 일자별 가중치를 계산함.
                  <br/>
                  <span className="text-gray-300 italic">MTD × (월전체가중치/누적가중치)</span>
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('projectedYoY')}
              >
                <div className="flex items-center justify-end">
                  환산 YoY
                  {getSortIcon('projectedYoY')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* HK 정상 */}
            {renderChannelSection('hk_normal', 'HK - 정상', data.hk_normal, data.hk_normal_subtotal)}

            {/* HK 아울렛 */}
            {renderChannelSection('hk_outlet', 'HK - 아울렛', data.hk_outlet, data.hk_outlet_subtotal)}

            {/* HK 온라인 */}
            {renderChannelSection('hk_online', 'HK - 온라인', data.hk_online, data.hk_online_subtotal)}

            {/* MC 정상 */}
            {renderChannelSection('mc_normal', 'MC - 정상', data.mc_normal, data.mc_normal_subtotal)}

            {/* MC 아울렛 */}
            {renderChannelSection('mc_outlet', 'MC - 아울렛', data.mc_outlet, data.mc_outlet_subtotal)}

            {/* MC 온라인 */}
            {renderChannelSection('mc_online', 'MC - 온라인', data.mc_online, data.mc_online_subtotal)}

            {/* MC 전체 합계 */}
            {data.mc_subtotal && (
              <>
                <tr className="h-2"></tr>
                <tr className="bg-yellow-50">
                  <td colSpan={7} className="px-4 py-2 font-bold text-gray-800">
                    MC 전체 합계
                  </td>
                </tr>
                {renderRow(data.mc_subtotal, true)}
              </>
            )}

            {/* HKMC 전체 합계 */}
            {data.total_subtotal && (
              <>
                <tr className="h-4"></tr>
                <tr className="bg-indigo-50">
                  <td colSpan={7} className="px-4 py-2 font-bold text-gray-800">
                    HKMC 전체 합계
                  </td>
                </tr>
                {renderRow(data.total_subtotal, true)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
