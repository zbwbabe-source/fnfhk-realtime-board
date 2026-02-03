'use client';

import { useState, useEffect } from 'react';

interface Section2Props {
  region: string;
  brand: string;
  date: string;
  onDataChange?: (data: any) => void;
}

interface ProductRow {
  prdt_cd: string;
  category: string;
  inbound_tag: number;
  sales_tag: number;
  inbound_qty: number;
  sales_qty: number;
  sellthrough: number;
}

interface CategoryRow {
  category: string;
  inbound_tag: number;
  sales_tag: number;
  inbound_qty: number;
  sales_qty: number;
  sellthrough: number;
  product_count: number;
}

interface NoInboundRow {
  prdt_cd: string;
  category: string;
  sales_tag: number;
}

export default function Section2SellThrough({ region, brand, date, onDataChange }: Section2Props) {
  const [expanded, setExpanded] = useState(true); // 기본 펼침
  const [showAllCategories, setShowAllCategories] = useState(false); // 전체 카테고리 토글
  const [showAllProducts, setShowAllProducts] = useState(false); // 전체 품번 토글
  const [categorySortConfig, setCategorySortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'sales_tag', direction: 'desc' });
  const [productSortConfig, setProductSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'sales_tag', direction: 'desc' });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // 필터용
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!date) return; // 항상 로드

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
        
        // 부모 컴포넌트에 데이터 전달
        if (onDataChange) {
          onDataChange(json);
        }
      } catch (err: any) {
        console.error('Section2 fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date, onDataChange]);

  const formatNumber = (num: number) => {
    // 천 HKD 단위로 변환 (금액용)
    const thousands = num / 1000;
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(thousands);
  };

  const formatQty = (num: number) => {
    // 수량은 그대로 표시
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(num);
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  // 카테고리 정렬 함수
  const handleCategorySort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (categorySortConfig.key === key && categorySortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setCategorySortConfig({ key, direction });
  };

  // 품번 정렬 함수
  const handleProductSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (productSortConfig.key === key && productSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setProductSortConfig({ key, direction });
  };

  // 정렬된 카테고리 데이터
  const getSortedCategories = () => {
    if (!data || !data.categories) return [];
    
    const categories = [...data.categories];
    
    categories.sort((a: any, b: any) => {
      const aValue = a[categorySortConfig.key];
      const bValue = b[categorySortConfig.key];
      
      if (aValue < bValue) {
        return categorySortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return categorySortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return categories;
  };

  // 표시할 카테고리 (5개 또는 전체)
  const getDisplayCategories = () => {
    const sorted = getSortedCategories();
    return showAllCategories ? sorted : sorted.slice(0, 5);
  };

  // 정렬된 전체 품번 데이터
  const getSortedProducts = () => {
    if (!data || !data.all_products) return [];
    
    const products = [...data.all_products];
    
    products.sort((a: any, b: any) => {
      const aValue = a[productSortConfig.key];
      const bValue = b[productSortConfig.key];
      
      if (aValue < bValue) {
        return productSortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return productSortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return products;
  };

  // 필터링된 품번 데이터
  const getFilteredProducts = () => {
    const sorted = getSortedProducts();
    if (!selectedCategory) return sorted;
    return sorted.filter(p => p.category === selectedCategory);
  };

  // 표시할 품번 (5개 또는 전체)
  const getDisplayProducts = () => {
    const filtered = getFilteredProducts();
    return showAllProducts ? filtered : filtered.slice(0, 5);
  };

  // 카테고리 정렬 아이콘
  const getCategorySortIcon = (key: string) => {
    if (categorySortConfig.key !== key) {
      return ' ↕';
    }
    return categorySortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  // 품번 정렬 아이콘
  const getProductSortIcon = (key: string) => {
    if (productSortConfig.key !== key) {
      return ' ↕';
    }
    return productSortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  // 카테고리 클릭 시 스크롤/필터
  const scrollToProductSection = (category: string) => {
    setSelectedCategory(category);
    const productSection = document.getElementById('product-detail-section');
    if (productSection) {
      setTimeout(() => {
        productSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const renderProductRow = (row: ProductRow) => (
    <tr key={row.prdt_cd}>
      <td className="px-4 py-2 border-b border-gray-200">{row.category}</td>
      <td className="px-4 py-2 border-b border-gray-200">{row.prdt_cd}</td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatQty(row.inbound_qty)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatQty(row.sales_qty)}
      </td>
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

  const renderCategoryRow = (row: CategoryRow) => (
    <tr 
      key={row.category}
      onClick={() => scrollToProductSection(row.category)}
      className="cursor-pointer hover:bg-blue-100 transition-colors"
    >
      <td className="px-4 py-2 border-b border-gray-200 font-medium">{row.category}</td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatQty(row.inbound_qty)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatQty(row.sales_qty)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.inbound_tag)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.sales_tag)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right font-medium">
        {formatPercent(row.sellthrough)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right text-gray-600">
        {formatNumber(row.product_count)}
      </td>
    </tr>
  );

  // 카테고리 목록 가져오기
  const getAvailableCategories = () => {
    if (!data || !data.categories) return [];
    return data.categories.map((c: CategoryRow) => c.category);
  };

  return (
    <div id="section2" className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header - Collapsible */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:text-gray-700 transition-colors"
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
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6">
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
              <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg border border-blue-200">
                {/* 시즌 정보 */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">시즌:</span>
                    <span className="text-xl font-bold text-gray-900">{data.header.sesn}</span>
                  </div>
                  {data.stock_dt_used && (
                    <div className="text-xs text-gray-500" title={`재고는 적재일 기준으로 ${data.stock_dt_used} 스냅샷 사용`}>
                      재고 기준일: {data.stock_dt_used}
                    </div>
                  )}
                </div>
                
                {/* 주요 지표 - 3컬럼 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">전체 판매율</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {data.header.overall_sellthrough.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-center border-l border-r border-blue-200">
                    <div className="text-xs text-gray-600 mb-1">누적판매</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatNumber(data.header.total_sales)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">누적입고</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatNumber(data.header.total_inbound)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 중분류(카테고리)별 집계 테이블 */}
              {data.categories && data.categories.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-300">
                  <div className="px-4 py-3 bg-blue-50 border-b border-gray-300 flex items-center justify-between">
                    <div>
                      <h3 className="text-md font-semibold text-gray-900">중분류(카테고리)별 집계</h3>
                      <p className="text-xs text-gray-600 mt-1">카테고리를 클릭하면 아래 품번별 상세로 이동합니다</p>
                    </div>
                    {/* TOP 5 토글 버튼 */}
                    {data.categories.length > 5 && (
                      <button
                        onClick={() => setShowAllCategories(!showAllCategories)}
                        className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors border border-blue-300"
                      >
                        {showAllCategories ? 'TOP 5만 보기' : '전체 펼치기'}
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-blue-50">
                        <tr>
                          <th 
                            className="px-4 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-blue-100"
                            onClick={() => handleCategorySort('category')}
                          >
                            카테고리{getCategorySortIcon('category')}
                          </th>
                          <th 
                            className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-blue-100"
                            onClick={() => handleCategorySort('inbound_qty')}
                          >
                            입고수량{getCategorySortIcon('inbound_qty')}
                          </th>
                          <th 
                            className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-blue-100"
                            onClick={() => handleCategorySort('sales_qty')}
                          >
                            판매수량{getCategorySortIcon('sales_qty')}
                          </th>
                          <th 
                            className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-blue-100"
                            onClick={() => handleCategorySort('inbound_tag')}
                          >
                            누적입고(TAG)<br/>
                            <span className="text-xs text-blue-600">(천 HKD)</span>
                            {getCategorySortIcon('inbound_tag')}
                          </th>
                          <th 
                            className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-blue-100"
                            onClick={() => handleCategorySort('sales_tag')}
                          >
                            누적판매(TAG)<br/>
                            <span className="text-xs text-blue-600">(천 HKD)</span>
                            {getCategorySortIcon('sales_tag')}
                          </th>
                          <th 
                            className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-blue-100"
                            onClick={() => handleCategorySort('sellthrough')}
                          >
                            판매율{getCategorySortIcon('sellthrough')}
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-gray-700">
                            품번수
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {getDisplayCategories().map((row: CategoryRow) => renderCategoryRow(row))}
                        {/* 전체 합계 행 */}
                        {data.category_total && (
                          <tr className="bg-gray-100 font-bold">
                            <td className="px-4 py-2 border-t-2 border-gray-300">{data.category_total.category}</td>
                            <td className="px-4 py-2 border-t-2 border-gray-300 text-right">
                              {formatQty(data.category_total.inbound_qty)}
                            </td>
                            <td className="px-4 py-2 border-t-2 border-gray-300 text-right">
                              {formatQty(data.category_total.sales_qty)}
                            </td>
                            <td className="px-4 py-2 border-t-2 border-gray-300 text-right">
                              {formatNumber(data.category_total.inbound_tag)}
                            </td>
                            <td className="px-4 py-2 border-t-2 border-gray-300 text-right">
                              {formatNumber(data.category_total.sales_tag)}
                            </td>
                            <td className="px-4 py-2 border-t-2 border-gray-300 text-right">
                              {formatPercent(data.category_total.sellthrough)}
                            </td>
                            <td className="px-4 py-2 border-t-2 border-gray-300 text-right">
                              {formatNumber(data.category_total.product_count)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 품번별 상세 테이블 */}
              <div id="product-detail-section" className="bg-white rounded-lg border border-gray-300 scroll-mt-4">
                <div className="px-4 py-3 bg-green-50 border-b border-gray-300 flex items-center justify-between">
                  <div>
                    <h3 className="text-md font-semibold text-gray-900">품번별 상세</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedCategory 
                        ? `필터: ${selectedCategory} 카테고리` 
                        : '전체 품번'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* 카테고리 필터 */}
                    <select
                      value={selectedCategory || ''}
                      onChange={(e) => setSelectedCategory(e.target.value || null)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">전체 카테고리</option>
                      {getAvailableCategories().map((cat: string) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    
                    {/* TOP 5 토글 */}
                    {getFilteredProducts().length > 5 && (
                      <button
                        onClick={() => setShowAllProducts(!showAllProducts)}
                        className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
                      >
                        {showAllProducts ? 'TOP 5만 보기' : '전체 펼치기'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">카테고리</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">품번</th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleProductSort('inbound_qty')}
                        >
                          입고수량{getProductSortIcon('inbound_qty')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleProductSort('sales_qty')}
                        >
                          판매수량{getProductSortIcon('sales_qty')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleProductSort('inbound_tag')}
                        >
                          누적입고(TAG)<br/>
                          <span className="text-xs text-blue-600">(천 HKD)</span>
                          {getProductSortIcon('inbound_tag')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleProductSort('sales_tag')}
                        >
                          누적판매(TAG)<br/>
                          <span className="text-xs text-blue-600">(천 HKD)</span>
                          {getProductSortIcon('sales_tag')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleProductSort('sellthrough')}
                        >
                          판매율{getProductSortIcon('sellthrough')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {getDisplayProducts().map((row: ProductRow) => renderProductRow(row))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
