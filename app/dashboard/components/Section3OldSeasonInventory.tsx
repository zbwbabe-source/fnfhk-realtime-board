'use client';

import React, { useState, useMemo } from 'react';
import { t, type Language } from '@/lib/translations';

interface Section3Props {
  region: string;
  brand: string;
  date: string;
  categoryFilter: 'clothes' | 'all';
  onCategoryFilterChange: (filter: 'clothes' | 'all') => void;
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
  season_code?: string; // ?곗감蹂??쒖쫵 肄붾뱶 (?? "24F", "23F", "~22F")
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
  season_type: string; // 'FW' ?먮뒗 'SS'
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

export default function Section3OldSeasonInventory({
  region,
  brand,
  date,
  categoryFilter,
  onCategoryFilterChange,
  onDataChange,
  language,
}: Section3Props) {
  const [data, setData] = useState<Section3Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ?뺤옣 ?곹깭 愿由?
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAllCategoriesInYear, setShowAllCategoriesInYear] = useState<Set<string>>(new Set()); // ?곗감蹂?湲고? 移댄뀒怨좊━ ?쒖떆 ?щ?
  const [isAllCategoriesExpanded, setIsAllCategoriesExpanded] = useState(false);
  const [isAllSKUsExpanded, setIsAllSKUsExpanded] = useState(false);
  
  // ?뺣젹 ?곹깭
  const [catSortConfig, setCatSortConfig] = useState<SortConfig>(null);
  const [skuSortConfig, setSkuSortConfig] = useState<SortConfig>(null);

  React.useEffect(() => {
    async function fetchData() {
      if (!date) {
        console.log('?좑툘 Section3: No date provided');
        return;
      }

      console.log('?뵇 Section3: Fetching data with params:', { region, brand, date });
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ region, brand, date, category_filter: categoryFilter });
        const url = `/api/section3/old-season-inventory?${params}`;
        console.log('?뵇 Section3: Fetching from URL:', url);
        
        const res = await fetch(url);
        
        console.log('?뱻 Section3: Response status:', res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('??Section3: Error response:', errorText);
          throw new Error(`HTTP error! status: ${res.status} - ${errorText}`);
        }

        const json = await res.json();
        console.log('??Section3: Received data:', json);
        setData(json);
        
        // 遺紐?而댄룷?뚰듃濡??곗씠???꾨떖
        if (onDataChange) {
          onDataChange(json);
        }
      } catch (err: any) {
        console.error('??Section3: Failed to fetch data:', err);
        console.error('??Section3: Error details:', err.message, err.stack);
        setError(err.message || (language === 'ko' ? '?곗씠?곕? 遺덈윭?ㅻ뒗???ㅽ뙣?덉뒿?덈떎.' : 'Failed to load data.'));
        
        // ?먮윭 ??null ?꾨떖
        if (onDataChange) {
          onDataChange(null);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date, categoryFilter, onDataChange]);

  // ?좏떥 ?⑥닔
  const formatNumber = (num: number | null | undefined, decimals = 0): string => {
    if (num == null) return '-';
    // 泥?HKD ?⑥쐞濡?蹂??
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

  const normalizeYearBucket = (value: string): string => {
    const raw = (value || '').trim();
    if (raw === '1년차' || raw === '2년차' || raw === '3년차 이상') return raw;
    if (raw.includes('3')) return '3년차 이상';
    if (raw.includes('2')) return '2년차';
    if (raw.includes('1')) return '1년차';
    return raw;
  };

  // ?좎쭨 ?щ㎎: YYYY-MM-DD -> YY-MM-DD
  const formatDateShort = (dateStr: string): string => {
    if (!dateStr) return '';
    // 2025-09-30 -> 25-09-30
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const yy = parts[0].slice(-2); // 留덉?留?2?먮━留?
      return `${yy}-${parts[1]}-${parts[2]}`;
    }
    return dateStr;
  };

  // ?뺤껜?ш퀬 CSV ?ㅼ슫濡쒕뱶 ?⑥닔
  const downloadStagnantStockCSV = () => {
    if (!data || !data.skus) return;

    // ?뺤껜?ш퀬媛 ?덈뒗 SKU留??꾪꽣留?
    const stagnantSKUs = data.skus.filter(sku => sku.stagnant_stock_amt > 0);

    if (stagnantSKUs.length === 0) {
      alert(language === 'ko' ? '?뺤껜?ш퀬 ?댁뿭???놁뒿?덈떎.' : 'No stagnant stock data available.');
      return;
    }

    // CSV ?ㅻ뜑 (?곷Ц 怨좎젙)
    const headers = ['Year', 'Season', 'Category', 'SKU', 'Base Stock (HKD)', 'Current Stock (HKD)', 'Stagnant Stock (HKD)', 'Depleted Stock (HKD)', 'Period Sales (TAG)', 'Period Sales (ACT)'];

    // CSV ?곗씠???앹꽦
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

    // CSV 臾몄옄???앹꽦
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    
    // BOM 異붽? (Excel?먯꽌 ?쒓? 源⑥쭚 諛⑹?)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // ?뚯씪紐??앹꽦
    const fileName = `stagnant_stock_${region}_${brand}_${data.asof_date}.csv`;
    
    // ?ㅼ슫濡쒕뱶 ?몃━嫄?
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

  // ?ш퀬?쇱닔 ?쒖떆 (?곹븳 999+???곸슜, ?먮ℓ?놁쓬 泥섎━)
  const formatInvDays = (invDaysRaw: number | null, invDays: number | null): string => {
    if (invDays === -1) return t(language, 'noSales'); // ?먮ℓ?놁쓬 ?뚮옒洹?
    if (invDaysRaw === null || invDays === null) return '-';
    if (invDaysRaw > 999) return `999+${t(language, 'days')}`;
    return `${Math.round(invDays)}${t(language, 'days')}`;
  };

  // ?ш퀬?쇱닔 ?됱긽 (365??珥덇낵 ??鍮④컙?? ?먮ℓ?놁쓬??鍮④컙??
  const getInvDaysColor = (invDaysRaw: number | null, invDays: number | null, isOverFlag?: boolean): string => {
    if (invDays === -1) return 'text-red-600'; // ?먮ℓ?놁쓬 鍮④컙??
    if (invDaysRaw === null) return '';
    if (isOverFlag || invDaysRaw > 365) return 'text-red-600';
    return '';
  };

  // 移댄뀒怨좊━ ?좉?
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

  // 湲고? 移댄뀒怨좊━ ?꾩껜 ?쇱튂湲??묎린
  const toggleAllOtherCategories = () => {
    if (isAllCategoriesExpanded) {
      // ?꾩껜 ?묎린
      setShowAllCategoriesInYear(new Set());
      setIsAllCategoriesExpanded(false);
      setIsAllSKUsExpanded(false); // SKU???④퍡 ?묎린
      setExpandedCategories(new Set());
    } else {
      // ?꾩껜 ?쇱튂湲?- 紐⑤뱺 ?곗감??湲고? 移댄뀒怨좊━ ?쒖떆
      if (data) {
        const allYears = new Set(data.years.map(y => y.year_bucket));
        setShowAllCategoriesInYear(allYears); // 紐⑤뱺 ?곗감?먯꽌 湲고? 移댄뀒怨좊━ ?쒖떆
        setIsAllCategoriesExpanded(true);
      }
    }
  };

  // ?덈쾲(SKU) ?꾩껜 ?쇱튂湲??묎린
  const toggleAllSKUs = () => {
    if (isAllSKUsExpanded) {
      // ?꾩껜 ?묎린
      setExpandedCategories(new Set());
      setIsAllSKUsExpanded(false);
    } else {
      // ?꾩껜 ?쇱튂湲?
      if (data) {
        setIsAllCategoriesExpanded(true);
        
        // 紐⑤뱺 移댄뀒怨좊━瑜??쇱묠
        const allCats = new Set(data.categories.map(c => `${c.year_bucket}_${c.cat2}`));
        setExpandedCategories(allCats);
        setIsAllSKUsExpanded(true);
      }
    }
  };

  // 移댄뀒怨좊━ ?뺣젹
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

  // SKU ?뺣젹
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

  // ?뺣젹 ?꾩씠肄?
  const getSortIcon = (key: string, config: SortConfig) => {
    if (!config || config.key !== key) return '↕';
    return config.direction === 'desc' ? '↓' : '↑';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">{t(language, 'section3Header')}</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">{t(language, 'loading')}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">{t(language, 'section3Header')}</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-red-500">{language === 'ko' ? `오류: ${error}` : `Error: ${error}`}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">{t(language, 'section3Header')}</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">{language === 'ko' ? '데이터가 없습니다.' : 'No data available.'}</div>
        </div>
      </div>
    );
  }

  // ?곗감 ?뺣젹 ?쒖꽌
  const yearOrder = ['1년차', '2년차', '3년차 이상'];
  const sortedYears = [...data.years].sort((a, b) => {
    const aIdx = yearOrder.indexOf(normalizeYearBucket(a.year_bucket));
    const bIdx = yearOrder.indexOf(normalizeYearBucket(b.year_bucket));
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  // ?곗감蹂?移댄뀒怨좊━ ?꾪꽣留?諛??뺣젹
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
      // 湲곕낯: ?뚯쭊?ш퀬??TAG) ?대┝李⑥닚
      cats = [...cats].sort((a, b) => b.depleted_stock_amt - a.depleted_stock_amt);
    }
    
    return cats;
  };

  // 移댄뀒怨좊━蹂?SKU ?꾪꽣留?諛??뺣젹
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
        <p className="text-sm text-gray-600">{language === 'ko' ? '단위: 1k HKD' : 'Unit: 1k HKD'}</p>
        <div className="flex items-center gap-1.5 text-sm text-orange-600">
          <span className="font-bold text-base">※</span>
          <span>{t(language, 'stagnantStockInfo')}</span>
        </div>
        
        {/* 의류만/악세포함 필터 버튼 */}
        <div className="flex items-center gap-2 ml-4">
          <span className="text-xs text-gray-600 whitespace-nowrap">{t(language, 'filterCategory')}</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm">
            <button
              onClick={() => onCategoryFilterChange('clothes')}
              className={`px-2.5 py-1 text-xs font-medium rounded-l-lg transition-colors ${
                categoryFilter === 'clothes' ? 'bg-orange-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'clothesOnly')}
            </button>
            <button
              onClick={() => onCategoryFilterChange('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-r-lg transition-colors ${
                categoryFilter === 'all' ? 'bg-orange-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(language, 'allCategory')}
            </button>
          </div>
        </div>

        {/* ?뺤껜?ш퀬 ?ㅼ슫濡쒕뱶 踰꾪듉 */}
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

      {/* ?뱀뀡1: ?곗감蹂?吏묎퀎 */}
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
                  <span className="ml-1 text-sm text-orange-500 font-bold">※</span>
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
              {/* ?곗감蹂??됰뱾 */}
              {sortedYears.map((year) => {
                // ?뺤껜?ш퀬鍮꾩쨷 怨꾩궛
                const stagnantRatio = year.curr_stock_amt > 0 
                  ? (year.stagnant_stock_amt / year.curr_stock_amt) * 100 
                  : 0;
                
                return (
                  <tr key={year.year_bucket} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-medium border-r border-gray-100">
                      {normalizeYearBucket(year.year_bucket)}
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
              
              {/* ?꾩껜 ?⑷퀎 ??*/}
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

      {/* ?뱀뀡2: 移댄뀒怨좊━蹂??댁뿭 (?곸꽭 ?꾩슜) */}
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
                  {normalizeYearBucket(year.year_bucket)}
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
                          {t(language, 'category')} {getSortIcon('cat2', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('base_stock_amt')}>
                          {t(language, 'baseStock')}<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.base_stock_date)})</span><br/>
                          {getSortIcon('base_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('curr_stock_amt')}>
                          {t(language, 'currentStock')}<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.asof_date)})</span><br/>
                          {getSortIcon('curr_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('stagnant_stock_amt')} title={t(language, 'stagnantStockInfo')}>
                          {t(language, 'stagnantStock')} <span className="text-orange-500 font-bold">※</span><br/>
                          {getSortIcon('stagnant_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100" title={t(language, 'stagnantRatioDesc')}>
                          {t(language, 'stagnantRatio')}<br/>
                          <span className="text-[10px] font-semibold text-orange-600">({t(language, 'stagnantRatioDesc')})</span>
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('depleted_stock_amt')}>
                          {t(language, 'depletedStock')}<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.period_start_date)} ~ {formatDateShort(data.asof_date)})</span><br/>
                          {getSortIcon('depleted_stock_amt', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('discount_rate')}>
                          {t(language, 'discountRate')}<br/>
                          {getSortIcon('discount_rate', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100 cursor-pointer hover:bg-gray-100" onClick={() => handleCatSort('inv_days')} title={t(language, 'inventoryDaysNote')}>
                          {t(language, 'inventoryDays')}<br/>
                          <span className="text-[10px] font-semibold text-blue-600">({formatDateShort(data.period_start_date)} ~ {formatDateShort(data.asof_date)})</span><br/>
                          {getSortIcon('inv_days', catSortConfig)}
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-700">
                          {language === 'ko' ? '상세' : 'Detail'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {/* ?쒖떆??移댄뀒怨좊━??(TOP5 ?먮뒗 ?꾩껜) */}
                      {displayCategories.map((cat) => {
                        const catKey = `${year.year_bucket}_${cat.cat2}`;
                        const isCatExpanded = expandedCategories.has(catKey);
                        const skus = getSKUsForCategory(year.year_bucket, cat.cat2);
                        
                        // 移댄뀒怨좊━蹂??뺤껜?ш퀬鍮꾩쨷 怨꾩궛
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

                            {/* SKU ?곸꽭 */}
                            {isCatExpanded && skus.map((sku, idx) => {
                              // SKU???좎씤?④낵 ?ш퀬?쇱닔瑜?怨꾩궛?댁꽌 ?쒖떆
                              const skuDiscRate = sku.period_tag_sales > 0 ? 1 - (sku.period_act_sales / sku.period_tag_sales) : 0;
                              
                              // SKU蹂??뺤껜?ш퀬鍮꾩쨷
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

                      {/* 湲고? 移댄뀒怨좊━ 踰꾪듉 (TOP5留??쒖떆 以묒씪 ?? */}
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

