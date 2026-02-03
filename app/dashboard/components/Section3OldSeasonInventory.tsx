'use client';

import React, { useState, useMemo } from 'react';

interface Section3Props {
  region: string;
  brand: string;
  date: string;
}

interface SKURow {
  year_bucket: string;
  sesn: string;
  cat2: string | null;
  prdt_cd: string;
  tag_stock_4q_end: number;
  tag_sales_4q: number;
  disc_rate_4q: number;
  inv_days_4q_raw: number | null;
  inv_days_4q: number | null;
  tag_stock_asof: number;
  tag_sales_cum: number;
  disc_rate_cum: number;
  inv_days_asof_raw: number | null;
  inv_days_asof: number | null;
}

interface CategoryRow {
  year_bucket: string;
  cat2: string;
  tag_stock_4q_end: number;
  tag_sales_4q: number;
  disc_rate_4q: number;
  inv_days_4q_raw: number | null;
  inv_days_4q: number | null;
  is_over_1y_4q: boolean;
  tag_stock_asof: number;
  tag_sales_cum: number;
  disc_rate_cum: number;
  inv_days_asof_raw: number | null;
  inv_days_asof: number | null;
  is_over_1y_asof: boolean;
}

interface YearRow {
  year_bucket: string;
  tag_stock_4q_end: number;
  tag_sales_4q: number;
  disc_rate_4q: number;
  inv_days_4q_raw: number | null;
  inv_days_4q: number | null;
  is_over_1y_4q: boolean;
  tag_stock_asof: number;
  tag_sales_cum: number;
  disc_rate_cum: number;
  inv_days_asof_raw: number | null;
  inv_days_asof: number | null;
  is_over_1y_asof: boolean;
}

interface Section3Data {
  asof_date: string;
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

export default function Section3OldSeasonInventory({ region, brand, date }: Section3Props) {
  const [data, setData] = useState<Section3Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 확장 상태 관리
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  
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
        
        // 초기 TOP5 자동 펼침
        if (json.categories && json.categories.length > 0) {
          const yearBuckets = [...new Set(json.categories.map((c: CategoryRow) => c.year_bucket))];
          yearBuckets.forEach(yb => {
            setExpandedYears(prev => new Set([...prev, yb]));
          });
        }
      } catch (err: any) {
        console.error('❌ Section3: Failed to fetch data:', err);
        console.error('❌ Section3: Error details:', err.message, err.stack);
        setError(err.message || '데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date]);

  // 유틸 함수들
  const formatNumber = (num: number | null | undefined, decimals = 0): string => {
    if (num == null) return '-';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (num: number | null | undefined): string => {
    if (num == null) return '-';
    return (num * 100).toFixed(1) + '%';
  };

  // 재고일수 표시 (상한 999+일 적용)
  const formatInvDays = (invDaysRaw: number | null, invDays: number | null): string => {
    if (invDaysRaw === null || invDays === null) return '-';
    if (invDaysRaw > 999) return '999+일';
    return `${Math.round(invDays)}일`;
  };

  // 재고일수 색상 (365일 초과 시 빨간색)
  const getInvDaysColor = (invDaysRaw: number | null, isOverFlag?: boolean): string => {
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

  // 연차 섹션 토글
  const toggleYear = (yearBucket: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(yearBucket)) {
        next.delete(yearBucket);
      } else {
        next.add(yearBucket);
      }
      return next;
    });
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
          <div className="text-gray-500">데이터를 불러오는 중...</div>
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
      // 기본: 누적판매(TAG) 내림차순
      cats = [...cats].sort((a, b) => b.tag_sales_cum - a.tag_sales_cum);
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
      <h2 className="text-xl font-bold mb-4">섹션3. 과시즌 재고 소진현황</h2>

      {/* 섹션1: 전체 합계 */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3 bg-blue-100 px-4 py-2 rounded">1. 전체 합계</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="px-3 py-2 text-center font-semibold border border-gray-300" rowSpan={2}>구분</th>
                <th className="px-3 py-2 text-center font-semibold border border-gray-300" colSpan={4}>4Q (2025년 10-12월)</th>
                <th className="px-3 py-2 text-center font-semibold border border-gray-300" colSpan={4}>선택일자 기준 ({data.asof_date})</th>
              </tr>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">4Q말 재고(TAG)</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">4Q 판매(TAG)</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">할인율</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300" title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.">재고일수</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">당일 재고(TAG)</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">누적 판매(TAG)</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">할인율</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300" title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.">재고일수</th>
              </tr>
            </thead>
            <tbody>
              {data.header && (
                <tr className="bg-blue-50 font-bold">
                  <td className="px-3 py-2 border border-gray-300">전체</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(data.header.tag_stock_4q_end)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(data.header.tag_sales_4q)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatPercent(data.header.disc_rate_4q)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatInvDays(data.header.inv_days_4q_raw, data.header.inv_days_4q)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(data.header.tag_stock_asof)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(data.header.tag_sales_cum)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatPercent(data.header.disc_rate_cum)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatInvDays(data.header.inv_days_asof_raw, data.header.inv_days_asof)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션2: 연차별 집계 (상세 불가) */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3 bg-green-100 px-4 py-2 rounded">2. 연차별 집계</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="px-3 py-2 text-center font-semibold border border-gray-300" rowSpan={2}>연차</th>
                <th className="px-3 py-2 text-center font-semibold border border-gray-300" colSpan={4}>4Q (2025년 10-12월)</th>
                <th className="px-3 py-2 text-center font-semibold border border-gray-300" colSpan={4}>선택일자 기준 ({data.asof_date})</th>
              </tr>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">4Q말 재고</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">4Q 판매</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">할인율</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300" title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.\n※ 색상 표시는 연차·카테고리 단위 관리 판단을 위한 표시입니다.">재고일수</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">당일 재고</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">누적 판매</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">할인율</th>
                <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300" title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.\n※ 색상 표시는 연차·카테고리 단위 관리 판단을 위한 표시입니다.">재고일수</th>
              </tr>
            </thead>
            <tbody>
              {sortedYears.map((year) => (
                <tr key={year.year_bucket} className="bg-yellow-50 font-semibold hover:bg-yellow-100">
                  <td className="px-3 py-2 border border-gray-300">{year.year_bucket}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(year.tag_stock_4q_end)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(year.tag_sales_4q)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatPercent(year.disc_rate_4q)}</td>
                  <td className={`px-2 py-2 text-right border border-gray-300 ${getInvDaysColor(year.inv_days_4q_raw, year.is_over_1y_4q)}`}>
                    {formatInvDays(year.inv_days_4q_raw, year.inv_days_4q)}
                  </td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(year.tag_stock_asof)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(year.tag_sales_cum)}</td>
                  <td className="px-2 py-2 text-right border border-gray-300">{formatPercent(year.disc_rate_cum)}</td>
                  <td className={`px-2 py-2 text-right border border-gray-300 ${getInvDaysColor(year.inv_days_asof_raw, year.is_over_1y_asof)}`}>
                    {formatInvDays(year.inv_days_asof_raw, year.inv_days_asof)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션3: 카테고리별 내역 (상세 전용) */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 bg-purple-100 px-4 py-2 rounded">3. 카테고리별 내역</h3>
        
        {sortedYears.map((year) => {
          const categories = getCategoriesForYear(year.year_bucket);
          const isYearExpanded = expandedYears.has(year.year_bucket);
          const top5 = categories.slice(0, 5);
          const others = categories.slice(5);

          return (
            <div key={year.year_bucket} className="mb-6">
              <div 
                className="flex items-center justify-between bg-gray-200 px-4 py-2 cursor-pointer hover:bg-gray-300"
                onClick={() => toggleYear(year.year_bucket)}
              >
                <h4 className="font-semibold">{year.year_bucket}</h4>
                <span className="text-blue-600">{isYearExpanded ? '▼' : '▶'}</span>
              </div>

              {isYearExpanded && (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="px-3 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('cat2')}>
                          카테고리 {getSortIcon('cat2', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('tag_stock_4q_end')}>
                          4Q말 재고 {getSortIcon('tag_stock_4q_end', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('tag_sales_4q')}>
                          4Q 판매 {getSortIcon('tag_sales_4q', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('disc_rate_4q')}>
                          할인율 {getSortIcon('disc_rate_4q', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('inv_days_4q')} title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.\n※ 색상 표시는 연차·카테고리 단위 관리 판단을 위한 표시입니다.">
                          재고일수 {getSortIcon('inv_days_4q', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('tag_stock_asof')}>
                          당일 재고 {getSortIcon('tag_stock_asof', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('tag_sales_cum')}>
                          누적 판매 {getSortIcon('tag_sales_cum', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('disc_rate_cum')}>
                          할인율 {getSortIcon('disc_rate_cum', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300 cursor-pointer" onClick={() => handleCatSort('inv_days_asof')} title="※ 재고일수 365일 초과 시 장기 재고로 간주되어 빨간색으로 표시됩니다.\n※ 색상 표시는 연차·카테고리 단위 관리 판단을 위한 표시입니다.">
                          재고일수 {getSortIcon('inv_days_asof', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-semibold border border-gray-300">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* TOP 5 */}
                      {top5.map((cat) => {
                        const catKey = `${year.year_bucket}_${cat.cat2}`;
                        const isCatExpanded = expandedCategories.has(catKey);
                        const skus = getSKUsForCategory(year.year_bucket, cat.cat2);

                        return (
                          <React.Fragment key={catKey}>
                            <tr className="bg-green-50 hover:bg-green-100 cursor-pointer" onClick={() => toggleCategory(year.year_bucket, cat.cat2)}>
                              <td className="px-3 py-2 font-semibold border border-gray-300">{cat.cat2}</td>
                              <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(cat.tag_stock_4q_end)}</td>
                              <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(cat.tag_sales_4q)}</td>
                              <td className="px-2 py-2 text-right border border-gray-300">{formatPercent(cat.disc_rate_4q)}</td>
                              <td className={`px-2 py-2 text-right border border-gray-300 ${getInvDaysColor(cat.inv_days_4q_raw, cat.is_over_1y_4q)}`}>
                                {formatInvDays(cat.inv_days_4q_raw, cat.inv_days_4q)}
                              </td>
                              <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(cat.tag_stock_asof)}</td>
                              <td className="px-2 py-2 text-right border border-gray-300">{formatNumber(cat.tag_sales_cum)}</td>
                              <td className="px-2 py-2 text-right border border-gray-300">{formatPercent(cat.disc_rate_cum)}</td>
                              <td className={`px-2 py-2 text-right border border-gray-300 ${getInvDaysColor(cat.inv_days_asof_raw, cat.is_over_1y_asof)}`}>
                                {formatInvDays(cat.inv_days_asof_raw, cat.inv_days_asof)}
                              </td>
                              <td className="px-2 py-2 text-center border border-gray-300">
                                <span className="text-blue-600 text-xs">{isCatExpanded ? '▼' : '▶'}</span>
                              </td>
                            </tr>

                            {/* SKU 상세 */}
                            {isCatExpanded && skus.map((sku, idx) => (
                              <tr key={`${sku.prdt_cd}_${idx}`} className="bg-gray-50 text-xs hover:bg-gray-100">
                                <td className="px-3 py-1 pl-8 border border-gray-300">└ {sku.prdt_cd}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatNumber(sku.tag_stock_4q_end)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatNumber(sku.tag_sales_4q)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatPercent(sku.disc_rate_4q)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatInvDays(sku.inv_days_4q_raw, sku.inv_days_4q)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatNumber(sku.tag_stock_asof)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatNumber(sku.tag_sales_cum)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatPercent(sku.disc_rate_cum)}</td>
                                <td className="px-2 py-1 text-right border border-gray-300">{formatInvDays(sku.inv_days_asof_raw, sku.inv_days_asof)}</td>
                                <td className="px-2 py-1 text-center border border-gray-300">-</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}

                      {/* 기타 카테고리 (접혀있음) */}
                      {others.length > 0 && (
                        <tr className="bg-gray-200">
                          <td colSpan={10} className="px-3 py-2 text-center text-sm border border-gray-300">
                            <button
                              onClick={() => {
                                others.forEach(cat => {
                                  const catKey = `${year.year_bucket}_${cat.cat2}`;
                                  setExpandedCategories(prev => new Set([...prev, catKey]));
                                });
                              }}
                              className="text-blue-600 hover:underline"
                            >
                              기타 카테고리 펼치기 ({others.length}개)
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
