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

interface NoInboundRow {
  prdt_cd: string;
  category: string;
  sales_tag: number;
}

export default function Section2SellThrough({ region, brand, date, onDataChange }: Section2Props) {
  const [expanded, setExpanded] = useState(true); // 기본 펼침
  const [showAllProducts, setShowAllProducts] = useState(false); // 전체 품번 토글
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'sellthrough', direction: 'desc' }); // 기본: 판매율 내림차순
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
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(num);
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  // 정렬 함수
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // 정렬된 전체 품번 데이터
  const getSortedProducts = () => {
    if (!data || !data.all_products) return [];
    
    const products = [...data.all_products];
    
    products.sort((a: any, b: any) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return products;
  };

  // 표시할 품번 (10개 또는 전체)
  const getDisplayProducts = () => {
    const sorted = getSortedProducts();
    return showAllProducts ? sorted : sorted.slice(0, 10);
  };

  // 정렬 아이콘
  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) {
      return ' ↕';
    }
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const renderProductRow = (row: ProductRow) => (
    <tr key={row.prdt_cd}>
      <td className="px-4 py-2 border-b border-gray-200">{row.prdt_cd}</td>
      <td className="px-4 py-2 border-b border-gray-200">{row.category}</td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.inbound_qty)}
      </td>
      <td className="px-4 py-2 border-b border-gray-200 text-right">
        {formatNumber(row.sales_qty)}
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
        
        {expanded && data && data.all_products && data.all_products.length > 10 && (
          <button
            onClick={() => setShowAllProducts(!showAllProducts)}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
          >
            {showAllProducts ? 'TOP 10만 보기' : '전체 펼치기'}
          </button>
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6">{/* border-t 제거 */}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600">누적판매:</span>
                      <span className="ml-2 text-md font-semibold text-gray-900">
                        {formatNumber(data.header.total_sales)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">누적입고:</span>
                      <span className="ml-2 text-md font-semibold text-gray-900">
                        {formatNumber(data.header.total_inbound)}
                      </span>
                    </div>
                  </div>
                  {data.stock_dt_used && (
                    <div className="col-span-full text-xs text-gray-500 text-center" title={`재고는 적재일 기준으로 ${data.stock_dt_used} 스냅샷 사용`}>
                      재고 기준일: {data.stock_dt_used}
                    </div>
                  )}
                </div>
              </div>

              {/* 품번 테이블 (상위 10개 또는 전체) */}
              <div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">품번</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">카테고리</th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleSort('inbound_qty')}
                        >
                          입고수량{getSortIcon('inbound_qty')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleSort('sales_qty')}
                        >
                          판매수량{getSortIcon('sales_qty')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleSort('inbound_tag')}
                        >
                          누적입고(TAG){getSortIcon('inbound_tag')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleSort('sales_tag')}
                        >
                          누적판매(TAG){getSortIcon('sales_tag')}
                        </th>
                        <th 
                          className="px-4 py-2 text-right font-medium text-gray-700 cursor-pointer hover:bg-green-100"
                          onClick={() => handleSort('sellthrough')}
                        >
                          판매율{getSortIcon('sellthrough')}
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
