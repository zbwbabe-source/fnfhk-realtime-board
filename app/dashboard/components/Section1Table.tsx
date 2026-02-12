'use client';

import { useState, useEffect } from 'react';
import { t, type Language } from '@/lib/translations';
import { formatYoY, isNewStore } from '@/lib/new-store-utils';

interface Section1TableProps {
  region: string;
  brand: string;
  date: string;
  onDataChange?: (data: any) => void;
  onYtdModeChange?: (isYtd: boolean) => void;
  language: Language;
}

interface StoreRow {
  shop_cd: string;
  shop_name: string;
  country: string;
  channel: string;
  
  // MTD
  target_mth: number;
  mtd_act: number;
  progress: number;
  mtd_act_py: number;
  mtd_act_pm: number;
  yoy: number;
  mom: number;
  monthEndProjection: number;
  projectedYoY: number;
  
  // YTD
  ytd_target: number;
  ytd_act: number;
  progress_ytd: number;
  ytd_act_py: number;
  yoy_ytd: number;
  
  forecast: number | null;
}

export default function Section1Table({ region, brand, date, onDataChange, onYtdModeChange, language }: Section1TableProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isYtdMode, setIsYtdMode] = useState(false); // 연누적(YTD) 모드 토글
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({
    'hk_normal': false,
    'hk_outlet': false,
    'hk_online': false,
    'mc_normal': false,
    'mc_outlet': false,
    'mc_online': false,
    'tw_normal': false,
    'tw_outlet': false,
    'tw_online': false,
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
      // 영업종료 매장(실적 0)은 항상 맨 아래로
      const actualValue = isYtdMode ? 'ytd_act' : 'mtd_act';
      const aIsClosed = a[actualValue] === 0;
      const bIsClosed = b[actualValue] === 0;
      
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
        case 'target':
          aValue = isYtdMode ? a.ytd_target : a.target_mth;
          bValue = isYtdMode ? b.ytd_target : b.target_mth;
          break;
        case 'actual':
          aValue = isYtdMode ? a.ytd_act : a.mtd_act;
          bValue = isYtdMode ? b.ytd_act : b.mtd_act;
          break;
        case 'progress':
          aValue = isYtdMode ? a.progress_ytd : a.progress;
          bValue = isYtdMode ? b.progress_ytd : b.progress;
          break;
        case 'actual_py':
          aValue = isYtdMode ? a.ytd_act_py : a.mtd_act_py;
          bValue = isYtdMode ? b.ytd_act_py : b.mtd_act_py;
          break;
        case 'yoy':
          // X 브랜드는 MoM, 나머지는 YoY
          if (brand === 'X') {
            aValue = isYtdMode ? a.yoy_ytd : a.mom;
            bValue = isYtdMode ? b.yoy_ytd : b.mom;
          } else {
            aValue = isYtdMode ? a.yoy_ytd : a.yoy;
            bValue = isYtdMode ? b.yoy_ytd : b.yoy;
          }
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
      'tw_normal': true,
      'tw_outlet': true,
      'tw_online': true,
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
      'tw_normal': false,
      'tw_outlet': false,
      'tw_online': false,
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

    console.log('🔍 Section1Table - Fetching data with params:', { region, brand, date });

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
        console.log('✅ Section1Table - Received data:', { 
          hasData: !!json, 
          hasTotal: !!json.total_subtotal,
          totalSubtotal: json.total_subtotal 
        });
        setData(json);
        
        // 부모 컴포넌트에 데이터 전달
        if (onDataChange) {
          console.log('📤 Section1Table - Sending data to parent');
          onDataChange(json);
        }
      } catch (err: any) {
        console.error('Section1 fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date, onDataChange]);

  // YTD 모드 변경 시 부모에게 알림
  useEffect(() => {
    if (onYtdModeChange) {
      onYtdModeChange(isYtdMode);
    }
  }, [isYtdMode, onYtdModeChange]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t(language, 'section1Header')} ({t(language, 'unit')})
        </h2>
        <div className="text-center py-8 text-gray-600">{t(language, 'loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t(language, 'section1Header')} ({t(language, 'unit')})
        </h2>
        <div className="text-center py-8 text-red-600">
          {t(language, 'error')}: {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const formatNumber = (num: number) => {
    // 천 HKD 단위로 변환
    const thousands = num / 1000;
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(thousands);
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(0)}%`;
  };

  const formatProgress = (num: number) => {
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
    
    // MTD/YTD 모드에 따라 사용할 subtotal 값 결정
    const subtotalTarget = subtotal ? (isYtdMode ? subtotal.ytd_target : subtotal.target_mth) : 0;
    const subtotalActual = subtotal ? (isYtdMode ? subtotal.ytd_act : subtotal.mtd_act) : 0;
    const subtotalProgress = subtotal ? (isYtdMode ? subtotal.progress_ytd : subtotal.progress) : 0;
    const subtotalActualPy = subtotal ? (isYtdMode ? subtotal.ytd_act_py : subtotal.mtd_act_py) : 0;
    // X 브랜드는 MoM, 나머지는 YoY
    const subtotalYoy = subtotal ? (isYtdMode ? subtotal.yoy_ytd : (brand === 'X' ? subtotal.mom : subtotal.yoy)) : 0;
    
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
              <span className="text-xs text-gray-500 font-normal">
                ({stores.length}{language === 'ko' ? '개 매장' : ' stores'})
              </span>
            </div>
          </td>
          {subtotal ? (
            <>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotalTarget)}
              </td>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotalActual)}
              </td>
              <td className={`px-4 py-2 border-b border-gray-200 text-right ${
                subtotalProgress < 80 ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatProgress(subtotalProgress)}
              </td>
              <td className="px-4 py-2 border-b border-gray-200 text-right">
                {formatNumber(subtotalActualPy)}
              </td>
              <td className={`px-4 py-2 border-b border-gray-200 text-right ${
                subtotalYoy < 80 ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatPercent(subtotalYoy)}
              </td>
              {isYtdMode ? (
                <>
                  {/* YTD 모드일 때 빈 셀 2개로 레이아웃 유지 */}
                  <td className="px-4 py-2 border-b border-gray-200 text-right text-gray-300">-</td>
                  <td className="px-4 py-2 border-b border-gray-200 text-right text-gray-300">-</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-2 border-b border-gray-200 text-right">
                    {formatNumber(subtotal.monthEndProjection)}
                  </td>
                  <td className={`px-4 py-2 border-b border-gray-200 text-right ${
                    subtotal.projectedYoY < 80 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {formatPercent(subtotal.projectedYoY)}
                  </td>
                </>
              )}
            </>
          ) : (
            <td colSpan={8} className="px-4 py-2 border-b border-gray-200"></td>
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
    // MTD/YTD 모드에 따라 사용할 값 결정
    const actualValue = isYtdMode ? row.ytd_act : row.mtd_act;
    const actualPyValue = isYtdMode ? row.ytd_act_py : row.mtd_act_py;
    const targetValue = isYtdMode ? row.ytd_target : row.target_mth;
    const progressValue = isYtdMode ? row.progress_ytd : row.progress;
    // X 브랜드는 MoM, 나머지는 YoY
    const yoyValue = isYtdMode ? row.yoy_ytd : (brand === 'X' ? row.mom : row.yoy);
    
    const isClosed = !isSubtotal && actualValue === 0;
    
    return (
      <tr key={row.shop_cd} className={`${isSubtotal ? 'bg-blue-50 font-semibold' : ''} ${isClosed ? 'bg-gray-100 opacity-60' : ''}`}>
        <td className="px-4 py-2 border-b border-gray-200">
          {isSubtotal ? (
            // 합계 행일 때는 빈 칸으로
            <div></div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isClosed ? 'text-gray-400' : 'text-gray-500'}`}>{row.shop_cd}</span>
              {row.shop_name && row.shop_name !== row.shop_cd && (
                <>
                  <span className={`font-medium text-base ${isClosed ? 'text-gray-400' : ''}`}>{row.shop_name}</span>
                  {isClosed && <span className="text-red-500 text-xs">({language === 'ko' ? '영업종료' : 'Closed'})</span>}
                </>
              )}
              {(!row.shop_name || row.shop_name === row.shop_cd) && (
                <>
                  <span className={`font-medium text-base ${isClosed ? 'text-gray-400' : ''}`}>{row.shop_cd}</span>
                  {isClosed && <span className="text-red-500 text-xs">({language === 'ko' ? '영업종료' : 'Closed'})</span>}
                </>
              )}
            </div>
          )}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(targetValue)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(actualValue)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${
          isClosed ? 'text-gray-400' : (progressValue < 80 ? 'text-red-600' : 'text-green-600')
        }`}>
          {formatProgress(progressValue)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
          {formatNumber(actualPyValue)}
        </td>
        <td className={`px-4 py-2 border-b border-gray-200 text-right ${
          isClosed ? 'text-gray-400' : (yoyValue < 80 ? 'text-red-600' : 'text-green-600')
        }`}>
          {isNewStore(actualPyValue) ? (
            <span className="text-blue-600 font-medium">{language === 'ko' ? '신규' : 'New'}</span>
          ) : (
            formatPercent(yoyValue)
          )}
        </td>
        {isYtdMode ? (
          <>
            {/* YTD 모드일 때 빈 셀 2개로 레이아웃 유지 */}
            <td className="px-4 py-2 border-b border-gray-200 text-right text-gray-300">-</td>
            <td className="px-4 py-2 border-b border-gray-200 text-right text-gray-300">-</td>
          </>
        ) : (
          <>
            <td className={`px-4 py-2 border-b border-gray-200 text-right ${isClosed ? 'text-gray-400' : ''}`}>
              {formatNumber(row.monthEndProjection)}
            </td>
            <td className={`px-4 py-2 border-b border-gray-200 text-right ${
              isClosed ? 'text-gray-400' : (row.projectedYoY < 80 ? 'text-red-600' : 'text-green-600')
            }`}>
              {isNewStore(actualPyValue) ? (
                <span className="text-blue-600 font-medium">{language === 'ko' ? '신규' : 'New'}</span>
              ) : (
                formatPercent(row.projectedYoY)
              )}
            </td>
          </>
        )}
      </tr>
    );
  };

  return (
    <div id="section1" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t(language, 'section1Header')} <span className="text-sm text-gray-600 font-normal">({t(language, 'unit')})</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsYtdMode(!isYtdMode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border-2 ${
                isYtdMode 
                  ? 'bg-blue-500 text-white border-blue-500 shadow-md hover:bg-blue-600 hover:shadow-lg' 
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm'
              }`}
            >
              {isYtdMode ? `✓ ${t(language, 'ytdToggle')}` : t(language, 'ytdToggle')}
            </button>
            {isYtdMode && date && (
              <span className="text-xs text-orange-600 font-medium">
                * {language === 'ko' ? '시즌최초~누적' : 'Season-to-Date'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={toggleAll}
          className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
        >
          {isAllExpanded ? t(language, 'collapseAll') : t(language, 'expandAll')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: '180px' }} /> {/* 매장 */}
            <col style={{ width: '120px' }} /> {/* 목표 */}
            <col style={{ width: '120px' }} /> {/* 실적 */}
            <col style={{ width: '100px' }} /> {/* 목표대비 */}
            <col style={{ width: '120px' }} /> {/* 전년 */}
            <col style={{ width: '100px' }} /> {/* YoY */}
            <col style={{ width: '120px' }} /> {/* 월말환산 or - */}
            <col style={{ width: '100px' }} /> {/* 환산YoY or - */}
          </colgroup>
          <thead className="bg-gray-100">
            <tr>
              <th 
                className="px-4 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('shop_name')}
              >
                <div className="flex items-center">
                  {t(language, 'storeName')}
                  {getSortIcon('shop_name')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('target')}
              >
                <div className="flex items-center justify-end">
                  {t(language, isYtdMode ? 'ytdTarget' : 'monthlyTarget')}
                  {getSortIcon('target')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('actual')}
              >
                <div className="flex flex-col items-end">
                  <div className="flex items-center">
                    {t(language, isYtdMode ? 'ytdActual' : 'monthlyActual')}
                    {getSortIcon('actual')}
                  </div>
                  {date && (
                    <div className="text-xs font-normal text-blue-600 mt-0.5">
                      ({date})
                    </div>
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('progress')}
              >
                <div className="flex items-center justify-end">
                  {t(language, 'progress')}
                  {getSortIcon('progress')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('actual_py')}
              >
                <div className="flex items-center justify-end">
                  {t(language, isYtdMode ? 'lastYearYtd' : 'lastYearSame')}
                  {getSortIcon('actual_py')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('yoy')}
              >
                <div className="flex items-center justify-end">
                  {t(language, brand === 'X' ? 'mom' : 'yoy')}
                  {getSortIcon('yoy')}
                </div>
              </th>
              {isYtdMode ? (
                <>
                  {/* YTD 모드일 때 빈 헤더 2개로 레이아웃 유지 */}
                  <th className="px-4 py-2 text-right font-medium text-gray-700 text-gray-300">-</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700 text-gray-300">-</th>
                </>
              ) : (
                <>
                  <th 
                    className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200 relative group"
                    onClick={() => handleSort('monthEndProjection')}
                  >
                    <div className="flex items-center justify-end">
                      {t(language, 'monthEndForecast')}
                      {getSortIcon('monthEndProjection')}
                      <span className="ml-1 text-xs text-gray-500 cursor-help">ⓘ</span>
                    </div>
                    <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded py-2 px-3 -top-16 right-0 w-64 z-10 shadow-lg">
                      {language === 'ko' 
                        ? '과거 2개년치 휴일/평일 일별 매출을 근거로 일자별 가중치를 계산함.'
                        : 'Calculated using weighted daily sales from past 2 years (holidays/weekdays).'}
                      <br/>
                      <span className="text-gray-300 italic">
                        {language === 'ko' 
                          ? 'MTD × (월전체가중치/누적가중치)'
                          : 'MTD × (Month Weight / YTD Weight)'}
                      </span>
                    </div>
                  </th>
                  <th 
                    className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('projectedYoY')}
                  >
                    <div className="flex items-center justify-end">
                      {t(language, 'forecastYoy')}
                      {getSortIcon('projectedYoY')}
                    </div>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {/* Region 분기: HKMC vs TW */}
            {region === 'TW' ? (
              <>
                {/* TW 정상 */}
                {renderChannelSection('tw_normal', 'TW - 정상', data.tw_normal, data.tw_normal_subtotal)}

                {/* TW 아울렛 */}
                {renderChannelSection('tw_outlet', 'TW - 아울렛', data.tw_outlet, data.tw_outlet_subtotal)}

                {/* TW 온라인 */}
                {renderChannelSection('tw_online', 'TW - 온라인', data.tw_online, data.tw_online_subtotal)}

                {/* TW 전체 합계 */}
                {data.tw_subtotal && (
                  <>
                    <tr className="h-2"></tr>
                    <tr className="bg-yellow-50">
                      <td colSpan={8} className="px-4 py-2 font-bold text-gray-800">
                        {language === 'ko' ? 'TW 전체 합계' : 'TW Total'}
                      </td>
                    </tr>
                    {renderRow(data.tw_subtotal, true)}
                  </>
                )}
              </>
            ) : (
              <>
                {/* HK 정상 */}
                {renderChannelSection('hk_normal', 'HK - 정상', data.hk_normal, data.hk_normal_subtotal)}

                {/* HK 아울렛 */}
                {renderChannelSection('hk_outlet', 'HK - 아울렛', data.hk_outlet, data.hk_outlet_subtotal)}

                {/* HK 온라인 */}
                {renderChannelSection('hk_online', 'HK - 온라인', data.hk_online, data.hk_online_subtotal)}

                {/* HK 전체 합계 */}
                {data.hk_subtotal && (
                  <>
                    <tr className="h-2"></tr>
                    <tr className="bg-yellow-50">
                      <td colSpan={8} className="px-4 py-2 font-bold text-gray-800">
                        {language === 'ko' ? 'HK 전체 합계' : 'HK Total'}
                      </td>
                    </tr>
                    {renderRow(data.hk_subtotal, true)}
                  </>
                )}

                {/* HK와 MC 사이 간격 */}
                <tr className="h-4"></tr>

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
                      <td colSpan={8} className="px-4 py-2 font-bold text-gray-800">
                        {language === 'ko' ? 'MC 전체 합계' : 'MC Total'}
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
                      <td colSpan={8} className="px-4 py-2 font-bold text-gray-800">
                        {language === 'ko' ? 'HKMC 전체 합계' : 'HKMC Total'}
                      </td>
                    </tr>
                    {renderRow(data.total_subtotal, true)}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
