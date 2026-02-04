'use client';

import React, { useState, useMemo } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section3Props {
  region: string;
  brand: string;
  date: string;
  onDataChange?: (data: Section3Data | null) => void;
  language: Language;
}

interface SKURow {
  year_bucket: string;
  sesn: string;
  cat2: string | null;
  prdt_cd: string;
  base_stock_amt: number;
  curr_stock_amt: number;
  stagnant_stock_amt: number;
  depleted_stock_amt: number;
  period_tag_sales: number;
  period_act_sales: number;
}

interface CategoryRow {
  year_bucket: string;
  cat2: string;
  base_stock_amt: number;
  curr_stock_amt: number;
  stagnant_stock_amt: number;
  depleted_stock_amt: number;
  discount_rate: number;
  inv_days_raw: number | null;
  inv_days: number | null;
  is_over_1y: boolean;
}

interface YearRow {
  year_bucket: string;
  season_code?: string; // 연차별 시즌 코드 (예: "24F", "23F", "~22F")
  sesn?: string;
  base_stock_amt: number;
  curr_stock_amt: number;
  stagnant_stock_amt: number;
  depleted_stock_amt: number;
  discount_rate: number;
  inv_days_raw: number | null;
  inv_days: number | null;
  is_over_1y: boolean;
}

interface Section3Data {
  asof_date: string;
  base_stock_date: string;
  period_start_date: string;
  season_type: string; // 'FW' 또는 'SS'
  region: string;
  brand: string;
  header: YearRow;
  years: YearRow[];
  categories: CategoryRow[];
  skus: SKURow[];
}

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

export default function Section3OldSeasonInventory({ region, brand, date, onDataChange, language }: Section3Props) {
  const [data, setData] = useState<Section3Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 확장 상태 관리
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAllCategoriesInYear, setShowAllCategoriesInYear] = useState<Set<string>>(new Set()); // 연차별 기타 카테고리 표시 여부
  const [isAllCategoriesExpanded, setIsAllCategoriesExpanded] = useState(false);
  const [isAllSKUsExpanded, setIsAllSKUsExpanded] = useState(false);
  
  // 정렬 상태
  const [catSortConfig, setCatSortConfig] = useState<SortConfig>(null);
  const [skuSortConfig, setSkuSortConfig] = useState<SortConfig>(null);

  React.useEffect(() => {
    async function fetchData() {
      if (!date) {
        console.log('⚠️ Section3: No date provided');
        return;
      }

      console.log('🔍 Section3: Fetching data with params:', { region, brand, date });
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ region, brand, date });
        const url = `/api/section3/old-season-inventory?${params}`;
        console.log('🔍 Section3: Fetching from URL:', url);
        
        const res = await fetch(url);
        
        console.log('📡 Section3: Response status:', res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('❌ Section3: Error response:', errorText);
          throw new Error(`HTTP error! status: ${res.status} - ${errorText}`);
        }

        const json = await res.json();
        console.log('✅ Section3: Received data:', json);
        setData(json);
        
        // 부모 컴포넌트로 데이터 전달
        if (onDataChange) {
          onDataChange(json);
        }
      } catch (err: any) {
        console.error('❌ Section3: Failed to fetch data:', err);
        console.error('❌ Section3: Error details:', err.message, err.stack);
        setError(err.message || (language === 'ko' ? '데이터를 불러오는데 실패했습니다.' : 'Failed to load data.'));
        
        // 에러 시 null 전달
        if (onDataChange) {
          onDataChange(null);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date, onDataChange]);

  // 유틸 함수들
  const formatNumber = (num: number | null | undefined, decimals = 0): string => {
    if (num == null) return '-';
    // 천 HKD 단위로 변환
    const thousands = num / 1000;
    return thousands.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (num: number | null | undefined): string => {
    if (num == null) return '-';
    return (num * 100).toFixed(1) + '%';
  };

  // 날짜 포맷: YYYY-MM-DD -> YY-MM-DD
  const formatDateShort = (dateStr: string): string => {
    if (!dateStr) return '';
    // 2025-09-30 -> 25-09-30
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const yy = parts[0].slice(-2); // 마지막 2자리만
      return `${yy}-${parts[1]}-${parts[2]}`;
    }
    return dateStr;
  };

  // 정체재고 CSV 다운로드 함수
  const downloadStagnantStockCSV = () => {
    if (!data || !data.skus) return;

    // 정체재고가 있는 SKU만 필터링
    const stagnantSKUs = data.skus.filter(sku => sku.stagnant_stock_amt > 0);

    if (stagnantSKUs.length === 0) {
      alert(language === 'ko' ? '정체재고 내역이 없습니다.' : 'No stagnant stock data available.');
      return;
    }

    // CSV 헤더
    const headers = language === 'ko' 
      ? ['연차', '시즌', '카테고리', '품번', '기초재고(HKD)', '현재재고(HKD)', '정체재고(HKD)', '소진재고(HKD)', '기간판매(TAG)', '기간판매(ACT)']
      : ['Year', 'Season', 'Category', 'SKU', 'Base Stock (HKD)', 'Current Stock (HKD)', 'Stagnant Stock (HKD)', 'Depleted Stock (HKD)', 'Period Sales (TAG)', 'Period Sales (ACT)'];

    // CSV 데이터 생성
    const csvRows = [headers];
    
    stagnantSKUs.forEach(sku => {
      csvRows.push([
        sku.year_bucket || '',
        sku.sesn || '',
        sku.cat2 || '',
        sku.prdt_cd || '',
        sku.base_stock_amt.toFixed(0),
        sku.curr_stock_amt.toFixed(0),
        sku.stagnant_stock_amt.toFixed(0),
        sku.depleted_stock_amt.toFixed(0),
        sku.period_tag_sales.toFixed(0),
        sku.period_act_sales.toFixed(0),
      ]);
    });

    // CSV 문자열 생성
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    
    // BOM 추가 (Excel에서 한글 깨짐 방지)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // 파일명 생성
    const fileName = `stagnant_stock_${region}_${brand}_${data.asof_date}.csv`;
    
    // 다운로드 트리거
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // 재고일수 표시 (상한 999+일 적용, 판매없음 처리)
  const formatInvDays = (invDaysRaw: number | null, invDays: number | null): string => {
    if (invDays === -1) return t(language, 'noSales');  // 판매없음 플래그
    if (invDaysRaw === null || invDays === null) return '-';
    if (invDaysRaw > 999) return `999+${t(language, 'days')}`;
    return `${Math.round(invDays)}${t(language, 'days')}`;
  };

  // 재고일수 색상 (365일 초과 시 빨간색, 판매없음도 빨간색)
  const getInvDaysColor = (invDaysRaw: number | null, invDays: number | null, isOverFlag?: boolean): string => {
    if (invDays === -1) return 'text-red-600';  // 판매없음 빨간색
    if (invDaysRaw === null) return '';
    if (isOverFlag || invDaysRaw > 365) return 'text-red-600';
    return '';
  };

  // 카테고리 토글
  const toggleCategory = (yearBucket: string, cat2: string) => {
    const key = `${yearBucket}_${cat2}`;
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 기타 카테고리 전체 펼치기/접기
  const toggleAllOtherCategories = () => {
    if (isAllCategoriesExpanded) {
      // 전체 접기
      setShowAllCategoriesInYear(new Set());
      setIsAllCategoriesExpanded(false);
      setIsAllSKUsExpanded(false); // SKU도 함께 접기
      setExpandedCategories(new Set());
    } else {
      // 전체 펼치기 - 모든 연차의 기타 카테고리 표시
      if (data) {
        const allYears = new Set(data.years.map(y => y.year_bucket));
        setShowAllCategoriesInYear(allYears); // 모든 연차에서 기타 카테고리 표시
        setIsAllCategoriesExpanded(true);
      }
    }
  };

  // 품번(SKU) 전체 펼치기/접기
  const toggleAllSKUs = () => {
    if (isAllSKUsExpanded) {
      // 전체 접기
      setExpandedCategories(new Set());
      setIsAllSKUsExpanded(false);
    } else {
      // 전체 펼치기
      if (data) {
        setIsAllCategoriesExpanded(true);
        
        // 모든 카테고리를 펼침
        const allCats = new Set(data.categories.map(c => `${c.year_bucket}_${c.cat2}`));
        setExpandedCategories(allCats);
        setIsAllSKUsExpanded(true);
      }
    }
  };

  // 카테고리 정렬
  const handleCatSort = (key: string) => {
    setCatSortConfig(prev => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { key, direction: 'asc' };
      }
      return null;
    });
  };

  // SKU 정렬
  const handleSkuSort = (key: string) => {
    setSkuSortConfig(prev => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { key, direction: 'asc' };
      }
      return null;
    });
  };

  // 정렬 아이콘
  const getSortIcon = (key: string, config: SortConfig) => {
    if (!config || config.key !== key) return '⇅';
    return config.direction === 'desc' ? '↓' : '↑';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">섹션3. 과시즌 재고 소진현황</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">{t(language, 'loading')}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">섹션3. 과시즌 재고 소진현황</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-red-500">오류: {error}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">섹션3. 과시즌 재고 소진현황</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">데이터가 없습니다.</div>
        </div>
      </div>
    );
  }

  // 연차 정렬 순서
  const yearOrder = ['1년차', '2년차', '3년차 이상'];
  const sortedYears = [...data.years].sort((a, b) => {
    return yearOrder.indexOf(a.year_bucket) - yearOrder.indexOf(b.year_bucket);
  });

  // 연차별 카테고리 필터링 및 정렬
  const getCategoriesForYear = (yearBucket: string) => {
    let cats = data.categories.filter(cat => cat.year_bucket === yearBucket);
    
    if (catSortConfig) {
      cats = [...cats].sort((a, b) => {
        const aVal = (a as any)[catSortConfig.key];
        const bVal = (b as any)[catSortConfig.key];
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        return catSortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
      });
    } else {
      // 기본: 소진재고액(TAG) 내림차순
      cats = [...cats].sort((a, b) => b.depleted_stock_amt - a.depleted_stock_amt);
    }
    
    return cats;
  };

  // 카테고리별 SKU 필터링 및 정렬
  const getSKUsForCategory = (yearBucket: string, cat2: string) => {
    let skus = data.skus.filter(sku => sku.year_bucket === yearBucket && sku.cat2 === cat2);
    
    if (skuSortConfig) {
      skus = [...skus].sort((a, b) => {
        const aVal = (a as any)[skuSortConfig.key];
        const bVal = (b as any)[skuSortConfig.key];
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        return skuSortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    return skus;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-2">
        {t(language, 'section3Header')}
        {data?.season_type && (
          <span className="ml-2 text-lg text-purple-600 font-semibold">
            ({data.season_type} {t(language, 'oldSeason')})
          </span>
        )}
      </h2>
      <div className="flex items-center gap-4 mb-4">
        <p className="text-sm text-gray-600">{language === 'ko' ? '단위: HKD' : 'Unit: HKD'}</p>
        <div className="flex items-center gap-1.5 text-sm text-orange-600">
          <span className="font-bold text-base">ⓘ</span>
          <span>{t(language, 'stagnantStockInfo')}</span>
        </div>
        {/* 정체재고 다운로드 버튼 */}
        {data && (
          <button
            onClick={downloadStagnantStockCSV}
            className="ml-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            title={language === 'ko' ? '정체재고 내역 다운로드' : 'Download Stagnant Stock Details'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{language === 'ko' ? '정체재고 다운로드' : 'Download Stagnant Stock'}</span>
          </button>
        )}
      </div>

      {/* 섹션1: 연차별 집계 */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3 inline-block bg-blue-50 px-4 py-2 rounded-lg">{t(language, 'yearlyAggregate')}</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full text-sm bg-white">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200">{t(language, 'yearGroup')}</th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                  {t(language, 'baseStock')}<br/>
                  <span className="text-xs font-semibold text-blue-600">({formatDateShort(data.base_stock_date)})</span>
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                  {t(language, 'currentStock')}<br/>
                  <span className="text-xs font-semibold text-blue-600">({formatDateShort(data.asof_date)})</span>
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200 cursor-help" title={t(language, 'stagnantStockInfo')}>
                  {t(language, 'stagnantStock')}
                  <span className="ml-1 text-sm text-orange-500 font-bold">ⓘ</span>
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200" title={t(language, 'stagnantRatioDesc')}>
                  {t(language, 'stagnantRatio')}<br/>
                  <span className="text-xs font-semibold text-orange-600">({t(language, 'stagnantRatioDesc')})</span>
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                  {t(language, 'depletedStock')}<br/>
                  <span className="text-xs font-semibold text-blue-600">({formatDateShort(data.period_start_date)} ~ {formatDateShort(data.asof_date)})</span>
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                  {t(language, 'discountRate')}
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-700 bg-gray-50" title={t(language, 'inventoryDaysNote')}>
                  {t(language, 'inventoryDays')}<br/>
                  <span className="text-xs font-semibold text-blue-600">({formatDateShort(data.period_start_date)} ~ {formatDateShort(data.asof_date)})</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* 연차별 행들 */}
              {sortedYears.map((year) => {
                // 정체재고비중 계산
                const stagnantRatio = year.curr_stock_amt > 0 
                  ? (year.stagnant_stock_amt / year.curr_stock_amt) * 100 
                  : 0;
                
                return (
                  <tr key={year.year_bucket} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-medium border-r border-gray-100">
                      {year.year_bucket}
                      {year.season_code && (
                        <span className="ml-2 text-xs text-blue-600 font-semibold">
                          ({year.season_code})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right border-r border-gray-100">{formatNumber(year.base_stock_amt)}</td>
                    <td className="px-2 py-2 text-right border-r border-gray-100">{formatNumber(year.curr_stock_amt)}</td>
                    <td className="px-2 py-2 text-right border-r border-gray-100">
                      <span className={year.stagnant_stock_amt > 0 ? 'text-orange-600 font-semibold' : ''}>
                        {formatNumber(year.stagnant_stock_amt)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right border-r border-gray-100">
                      <span className={stagnantRatio > 0 ? 'text-orange-600 font-semibold' : ''}>
                        {stagnantRatio.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right border-r border-gray-100">{formatNumber(year.depleted_stock_amt)}</td>
                    <td className="px-2 py-2 text-right border-r border-gray-100">{formatPercent(year.discount_rate)}</td>
                    <td className={`px-2 py-2 text-right ${getInvDaysColor(year.inv_days_raw, year.inv_days, year.is_over_1y)}`}>
                      {formatInvDays(year.inv_days_raw, year.inv_days)}
                    </td>
                  </tr>
                );
              })}
              
              {/* 전체 합계 행 */}
              {data.header && (() => {
                const headerStagnantRatio = data.header.curr_stock_amt > 0 
                  ? (data.header.stagnant_stock_amt / data.header.curr_stock_amt) * 100 
                  : 0;
                
                return (
                  <tr className="font-semibold hover:bg-blue-100 transition-colors border-t-2 border-blue-300">
                    <td className="px-3 py-2 bg-blue-100 border-r border-gray-100">{t(language, 'total')}</td>
                    <td className="px-2 py-2 text-right bg-blue-100 border-r border-gray-100">{formatNumber(data.header.base_stock_amt)}</td>
                    <td className="px-2 py-2 text-right bg-blue-100 border-r border-gray-100">{formatNumber(data.header.curr_stock_amt)}</td>
                    <td className="px-2 py-2 text-right bg-blue-100 border-r border-gray-100">
                      <span className={data.header.stagnant_stock_amt > 0 ? 'text-orange-600 font-semibold' : ''}>
                        {formatNumber(data.header.stagnant_stock_amt)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right bg-blue-100 border-r border-gray-100">
                      <span className={headerStagnantRatio > 0 ? 'text-orange-600 font-semibold' : ''}>
                        {headerStagnantRatio.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right bg-blue-100 border-r border-gray-100">{formatNumber(data.header.depleted_stock_amt)}</td>
                    <td className="px-2 py-2 text-right bg-blue-100 border-r border-gray-100">{formatPercent(data.header.discount_rate)}</td>
                    <td className="px-2 py-2 text-right bg-blue-100">{formatInvDays(data.header.inv_days_raw, data.header.inv_days)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션2: 카테고리별 내역 (상세 전용) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold bg-purple-100 px-4 py-2 rounded">{t(language, 'categoryDetails')}</h3>
          <div className="flex gap-2">
            <button
              onClick={toggleAllOtherCategories}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
            >
              {isAllCategoriesExpanded ? t(language, 'collapseOtherCategories') : t(language, 'expandOtherCategories')}
            </button>
            <button
              onClick={toggleAllSKUs}
              className="px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors border border-purple-300"
            >
              {isAllSKUsExpanded ? t(language, 'collapseProducts') : t(language, 'expandProducts')}
            </button>
          </div>
        </div>
        
        {sortedYears.map((year) => {
          const categories = getCategoriesForYear(year.year_bucket);
          const showAllCats = showAllCategoriesInYear.has(year.year_bucket);
          const top5 = categories.slice(0, 5);
          const others = categories.slice(5);
          const displayCategories = showAllCats ? categories : top5;

          return (
            <div key={year.year_bucket} className="mb-6">
              <div className="mb-2">
                <h4 className="inline-block font-semibold text-gray-800 bg-gradient-to-r from-gray-100 to-gray-50 px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                  {year.year_bucket}
                  {year.season_code && (
                    <span className="ml-2 text-sm text-blue-600">
                      ({year.season_code})
                    </span>
                  )}
                </h4>
              </div>

              <div className="overflow-x-auto mt-2 rounded-lg border border-gray-200 shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('cat2')}>
                          카테고리 {getSortIcon('cat2', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('base_stock_amt')}>
                          기초재고(TAG)<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.base_stock_date)})</span><br/>
                          {getSortIcon('base_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('curr_stock_amt')}>
                          현재재고(TAG)<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.asof_date)})</span><br/>
                          {getSortIcon('curr_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('stagnant_stock_amt')} title="최근 30일 판매가 없거나 재고의 0.1% 미만인 재고">
                          정체재고(TAG) <span className="text-orange-500 font-bold">ⓘ</span><br/>
                          {getSortIcon('stagnant_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100" title="현재재고 대비 정체재고 비율">
                          정체재고비중<br/>
                          <span className="text-[10px] font-semibold text-orange-600">(정체재고 / 현재재고)</span>
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('depleted_stock_amt')}>
                          소진재고액(TAG)<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.period_start_date)} ~ {formatDateShort(data.asof_date)})</span><br/>
                          {getSortIcon('depleted_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('discount_rate')}>
                          할인율<br/>
                          {getSortIcon('discount_rate', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('inv_days')} title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.&#10;※ 색상 표시는 연차·카테고리 단위 관리 판단을 위한 표시입니다.">
                          재고일수(기간)<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.period_start_date)} ~ {formatDateShort(data.asof_date)})</span><br/>
                          {getSortIcon('inv_days', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700">상세</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {/* 표시할 카테고리들 (TOP5 또는 전체) */}
                      {displayCategories.map((cat) => {
                        const catKey = `${year.year_bucket}_${cat.cat2}`;
                        const isCatExpanded = expandedCategories.has(catKey);
                        const skus = getSKUsForCategory(year.year_bucket, cat.cat2);
                        
                        // 카테고리별 정체재고비중 계산
                        const catStagnantRatio = cat.curr_stock_amt > 0 
                          ? (cat.stagnant_stock_amt / cat.curr_stock_amt) * 100 
                          : 0;

                        return (
                          <React.Fragment key={catKey}>
                            <tr className="bg-green-50 hover:bg-green-100 cursor-pointer transition-colors" onClick={() => toggleCategory(year.year_bucket, cat.cat2)}>
                              <td className="px-3 py-2 font-medium border-r border-gray-100">{cat.cat2}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-100">{formatNumber(cat.base_stock_amt)}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-100">{formatNumber(cat.curr_stock_amt)}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-100">
                                <span className={cat.stagnant_stock_amt > 0 ? 'text-orange-600 font-semibold' : ''}>
                                  {formatNumber(cat.stagnant_stock_amt)}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right border-r border-gray-100">
                                <span className={catStagnantRatio > 0 ? 'text-orange-600 font-semibold' : ''}>
                                  {catStagnantRatio.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right border-r border-gray-100">{formatNumber(cat.depleted_stock_amt)}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-100">{formatPercent(cat.discount_rate)}</td>
                              <td className={`px-2 py-2 text-right border-r border-gray-100 ${getInvDaysColor(cat.inv_days_raw, cat.inv_days, cat.is_over_1y)}`}>
                                {formatInvDays(cat.inv_days_raw, cat.inv_days)}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <span className="text-blue-600 text-xs">{isCatExpanded ? '▼' : '▶'}</span>
                              </td>
                            </tr>

                            {/* SKU 상세 */}
                            {isCatExpanded && skus.map((sku, idx) => {
                              // SKU는 할인율과 재고일수를 계산해서 표시
                              const skuDiscRate = sku.period_tag_sales > 0 ? 1 - (sku.period_act_sales / sku.period_tag_sales) : 0;
                              
                              // SKU별 정체재고비중
                              const skuStagnantRatio = sku.curr_stock_amt > 0 
                                ? (sku.stagnant_stock_amt / sku.curr_stock_amt) * 100 
                                : 0;
                              
                              return (
                                <tr key={`${sku.prdt_cd}_${idx}`} className="bg-white text-xs hover:bg-gray-50 transition-colors">
                                  <td className="px-3 py-1 pl-8 border-r border-gray-100">{sku.prdt_cd}</td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">{formatNumber(sku.base_stock_amt)}</td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">{formatNumber(sku.curr_stock_amt)}</td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">
                                    <span className={sku.stagnant_stock_amt > 0 ? 'text-orange-600 font-semibold' : ''}>
                                      {formatNumber(sku.stagnant_stock_amt)}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">
                                    <span className={skuStagnantRatio > 0 ? 'text-orange-600' : ''}>
                                      {skuStagnantRatio.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">{formatNumber(sku.depleted_stock_amt)}</td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">{formatPercent(skuDiscRate)}</td>
                                  <td className="px-2 py-1 text-right border-r border-gray-100">-</td>
                                  <td className="px-2 py-1 text-center text-gray-400">-</td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* 기타 카테고리 버튼 (TOP5만 표시 중일 때) */}
                      {!showAllCats && others.length > 0 && (
                        <tr className="bg-gray-50 border-t border-gray-200">
                          <td colSpan={9} className="px-3 py-3 text-center text-sm">
                            <button
                              onClick={() => {
                                setShowAllCategoriesInYear(prev => new Set([...prev, year.year_bucket]));
                              }}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                            >
                              {t(language, 'expandOtherCategories')} ({others.length}{t(language, 'items')})
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
