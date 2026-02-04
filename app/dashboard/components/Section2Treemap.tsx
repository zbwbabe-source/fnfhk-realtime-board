'use client';

import { useState, useEffect, useMemo } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { type Language } from '@/lib/translations';
import { getColorByLargeCategory } from '@/lib/category-utils';

interface TreemapProps {
  region: string;
  brand: string;
  date: string;
  language: Language;
}

interface SmallCategory {
  code: string;
  sales_amt: number;
  sales_pct: number;
  discount_rate: number;
  discount_rate_ly: number;
  discount_rate_diff: number;
  yoy: number | null;
}

interface MiddleCategory {
  name: string;
  sales_amt: number;
  sales_pct: number;
  discount_rate: number;
  discount_rate_ly: number;
  discount_rate_diff: number;
  yoy: number | null;
  small_categories: SmallCategory[];
}

interface LargeCategory {
  name: string;
  sales_amt: number;
  sales_pct: number;
  discount_rate: number;
  discount_rate_ly: number;
  discount_rate_diff: number;
  yoy: number | null;
  middle_categories: MiddleCategory[];
}

interface TreemapData {
  asof_date: string;
  mode: string;
  region: string;
  brand: string;
  sesn: string;
  total_sales: number;
  large_categories: LargeCategory[];
}

type TreemapMode = 'compact' | 'detail';

export default function Section2Treemap({ region, brand, date, language }: TreemapProps) {
  const [mode, setMode] = useState<'monthly' | 'ytd'>('monthly');
  const [data, setData] = useState<TreemapData | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!date) return;

    async function fetchData() {
      setLoading(true);
      setError('');
      setIsTransitioning(true);

      try {
        const url = `/api/section2/treemap?region=${region}&brand=${brand}&date=${date}&mode=${mode}`;
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error('Failed to fetch treemap data');
        }

        const json = await res.json();
        console.log('📊 Treemap data received:', {
          asof_date: json.asof_date,
          sesn: json.sesn,
          mode: json.mode,
          large_count: json.large_categories?.length,
          large_categories: json.large_categories?.map((l: any) => ({ 
            name: l.name, 
            sales: l.sales_amt,
            middle_count: l.middle_categories?.length 
          })),
        });
        setData(json);
        
        // 애니메이션 타이밍
        setTimeout(() => setIsTransitioning(false), 160);
      } catch (err: any) {
        console.error('❌ Treemap fetch error:', err);
        setError(err.message);
        setIsTransitioning(false);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date, mode]);

  // 드릴다운 데이터 계산 (비중 조정 로직 포함)
  const displayData = useMemo(() => {
    if (!data) return [];

    let rawData: any[] = [];

    if (currentPath.length === 0) {
      // 대분류
      rawData = data.large_categories.map(large => ({
        name: large.name,
        value: large.sales_amt,
        sales_pct: large.sales_pct,
        discount_rate: large.discount_rate,
        discount_rate_diff: large.discount_rate_diff,
        yoy: large.yoy,
      }));
    } else if (currentPath.length === 1) {
      // 중분류
      const large = data.large_categories.find(l => l.name === currentPath[0]);
      if (!large) return [];
      rawData = large.middle_categories.map(middle => ({
        name: middle.name,
        value: middle.sales_amt,
        sales_pct: middle.sales_pct,
        discount_rate: middle.discount_rate,
        discount_rate_diff: middle.discount_rate_diff,
        yoy: middle.yoy,
      }));
    } else {
      // 소분류
      const large = data.large_categories.find(l => l.name === currentPath[0]);
      if (!large) return [];
      const middle = large.middle_categories.find(m => m.name === currentPath[1]);
      if (!middle) return [];
      rawData = middle.small_categories.map(small => ({
        name: small.code,
        value: small.sales_amt,
        sales_pct: small.sales_pct,
        discount_rate: small.discount_rate,
        discount_rate_diff: small.discount_rate_diff,
        yoy: small.yoy,
      }));
    }

    // 비중 조정: 큰 값의 영향력을 줄여 작은 항목도 보이도록
    // 제곱근을 적용하여 차이를 완화 (sqrt normalization)
    const adjustedData = rawData.map(item => ({
      ...item,
      value: Math.pow(item.value, 0.7), // 0.7 제곱으로 큰 값의 영향력 감소
    }));

    return adjustedData;
  }, [data, currentPath]);

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentPath([]);
    } else {
      setCurrentPath(currentPath.slice(0, index + 1));
    }
  };

  const formatSales = (value: number) => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    } else if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  /**
   * 커스텀 Treemap 셀 렌더링
   * @param treemapMode - 'compact': 카테고리명+비중만 표시 / 'detail': 모든 지표 표시
   */
  const createCustomizedContent = (treemapMode: TreemapMode) => {
    return (props: any): JSX.Element => {
      const { x, y, width, height, name, value, sales_pct, discount_rate, discount_rate_diff, yoy } = props;

      if (!name) return <g />;

      // 색상 결정
      let fillColor = '#D1D5DB';
      if (currentPath.length === 0) {
        fillColor = getColorByLargeCategory(name);
      } else if (currentPath.length === 1) {
        fillColor = getColorByLargeCategory(currentPath[0]);
      } else {
        fillColor = getColorByLargeCategory(currentPath[0]);
      }

      // ========== COMPACT 모드: 카테고리명 + 비중만 ==========
      if (treemapMode === 'compact') {
        // 최소 크기: 50x40px 이상만 텍스트 표시
        if (width < 50 || height < 40) {
          return (
            <g>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={fillColor}
                stroke="#fff"
                strokeWidth={2}
                className="cursor-pointer"
                onClick={() => {
                  if (currentPath.length < 2) {
                    setCurrentPath([...currentPath, name]);
                  }
                }}
              />
            </g>
          );
        }

        return (
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={fillColor}
              stroke="#fff"
              strokeWidth={2}
              className="cursor-pointer"
              onClick={() => {
                if (currentPath.length < 2) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ fontWeight: 300, textShadow: 'none', filter: 'none' }}
            >
              <tspan x={x + width / 2} dy="-0.5em" fontSize="14">
                {name}
              </tspan>
              <tspan x={x + width / 2} dy="1.5em" fontSize="13">
                {sales_pct?.toFixed(1)}%
              </tspan>
            </text>
          </g>
        );
      }

      // ========== DETAIL 모드: 모든 지표 표시 ==========
      const discountColor = discount_rate_diff > 0 ? '#DC2626' : '#2563EB';
      const discountSymbol = discount_rate_diff > 0 ? '+' : '▼';

      // 초대형 셀 (>180px): 모든 정보
      if (width > 180 && height > 140) {
        return (
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={fillColor}
              stroke="#fff"
              strokeWidth={1}
              className="cursor-pointer"
              onClick={() => {
                if (currentPath.length < 2) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ fontWeight: 300, textShadow: 'none', filter: 'none' }}
            >
              <tspan x={x + width / 2} dy="-3em" fontSize="20">
                {name}
              </tspan>
              <tspan x={x + width / 2} dy="1.6em" fontSize="18">
                {formatSales(value)}
              </tspan>
              <tspan x={x + width / 2} dy="1.5em" fontSize="15">
                ({sales_pct?.toFixed(1)}%)
              </tspan>
              <tspan x={x + width / 2} dy="1.5em" fontSize="15">
                YoY: {yoy ? yoy.toFixed(0) : 'N/A'}%
              </tspan>
              <tspan x={x + width / 2} dy="1.5em" fontSize="15">
                {language === 'ko' ? '할인' : 'Disc'}: {discount_rate?.toFixed(1)}%
              </tspan>
              <tspan 
                x={x + width / 2} 
                dy="1.4em" 
                fontSize="14"
                fill={discountColor}
              >
                ({discountSymbol}{Math.abs(discount_rate_diff || 0).toFixed(1)}%p)
              </tspan>
            </text>
          </g>
        );
      }

      // 대형 셀 (120-180px): 핵심 정보
      if (width > 120 && height > 90) {
        return (
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={fillColor}
              stroke="#fff"
              strokeWidth={1}
              className="cursor-pointer"
              onClick={() => {
                if (currentPath.length < 2) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ fontWeight: 300, textShadow: 'none', filter: 'none' }}
            >
              <tspan x={x + width / 2} dy="-2.5em" fontSize="16">
                {name}
              </tspan>
              <tspan x={x + width / 2} dy="1.5em" fontSize="15">
                {formatSales(value)}
              </tspan>
              <tspan x={x + width / 2} dy="1.4em" fontSize="13">
                ({sales_pct?.toFixed(1)}%)
              </tspan>
              <tspan x={x + width / 2} dy="1.3em" fontSize="13">
                YoY: {yoy ? yoy.toFixed(0) : 'N/A'}%
              </tspan>
              <tspan x={x + width / 2} dy="1.3em" fontSize="13">
                {discount_rate?.toFixed(1)}%
              </tspan>
              <tspan 
                x={x + width / 2} 
                dy="1.2em" 
                fontSize="12"
                fill={discountColor}
              >
                ({discountSymbol}{Math.abs(discount_rate_diff || 0).toFixed(1)}%p)
              </tspan>
            </text>
          </g>
        );
      }

      // 중형 셀 (70-120px): 기본 정보
      if (width > 70 && height > 60) {
        return (
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={fillColor}
              stroke="#fff"
              strokeWidth={1}
              className="cursor-pointer"
              onClick={() => {
                if (currentPath.length < 2) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ fontWeight: 300, textShadow: 'none', filter: 'none' }}
            >
              <tspan x={x + width / 2} dy="-1.5em" fontSize="14">
                {name}
              </tspan>
              <tspan x={x + width / 2} dy="1.4em" fontSize="13">
                {formatSales(value)}
              </tspan>
              <tspan x={x + width / 2} dy="1.3em" fontSize="12">
                ({sales_pct?.toFixed(1)}%)
              </tspan>
              <tspan x={x + width / 2} dy="1.2em" fontSize="11">
                {discount_rate?.toFixed(1)}%
              </tspan>
            </text>
          </g>
        );
      }

      // 소형 셀 (40-70px): 이름과 비중만
      if (width > 40 && height > 35) {
        return (
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={fillColor}
              stroke="#fff"
              strokeWidth={2}
              className="cursor-pointer"
              onClick={() => {
                if (currentPath.length < 2) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ fontWeight: 300, textShadow: 'none', filter: 'none' }}
            >
              <tspan x={x + width / 2} dy="-0.5em" fontSize="11">
                {name}
              </tspan>
              <tspan x={x + width / 2} dy="1.3em" fontSize="10">
                {sales_pct?.toFixed(1)}%
              </tspan>
            </text>
          </g>
        );
      }

      // 극소형 셀: 텍스트 숨김
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={fillColor}
            stroke="#fff"
            strokeWidth={2}
            className="cursor-pointer transition-opacity hover:opacity-90"
            onClick={() => {
              if (currentPath.length < 2) {
                setCurrentPath([...currentPath, name]);
              }
            }}
          />
        </g>
      );
    };
  };

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const discountColor = data.discount_rate_diff > 0 ? '#DC2626' : '#2563EB';
    const discountSymbol = data.discount_rate_diff > 0 ? '+' : '▼';

    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 text-sm">
        <div className="font-bold text-gray-900 mb-2">{data.name}</div>
        <div className="space-y-1 text-gray-700">
          <div>{language === 'ko' ? '매출' : 'Sales'}: {formatSales(data.value)}</div>
          <div>{language === 'ko' ? '비중' : 'Share'}: {data.sales_pct?.toFixed(1)}%</div>
          <div>YoY: {data.yoy ? data.yoy.toFixed(1) : 'N/A'}%</div>
          <div>
            {language === 'ko' ? '할인율' : 'Discount'}: {data.discount_rate?.toFixed(1)}%
            <span style={{ color: discountColor, fontWeight: 'bold', marginLeft: '4px' }}>
              ({discountSymbol}{Math.abs(data.discount_rate_diff || 0).toFixed(1)}%p)
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-[350px] text-gray-500">
          {language === 'ko' ? '로딩 중...' : 'Loading...'}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-[350px] text-red-500">
          {error}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ========== 기본 카드 (COMPACT 모드) ========== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* 헤더: 제목 + 당월/누적 버튼 + 확대 버튼 */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            {language === 'ko' ? '카테고리별 매출 구성' : 'Sales by Category'}
          </h3>
          <div className="flex gap-2">
            {/* 당월/누적 토글 */}
            <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setMode('monthly')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  mode === 'monthly'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {language === 'ko' ? '당월' : 'Monthly'}
              </button>
              <button
                onClick={() => setMode('ytd')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  mode === 'ytd'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {language === 'ko' ? '누적' : 'YTD'}
              </button>
            </div>
            {/* 확대 버튼 */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              title={language === 'ko' ? '확대' : 'Expand'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 대상기간 표시 */}
        {data && (
          <div className="text-xs text-gray-500 mb-3">
            {language === 'ko' ? '기준일' : 'As of'}: {data.asof_date} ({data.sesn})
          </div>
        )}

        {/* Breadcrumb */}
        {currentPath.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <button
              onClick={() => handleBreadcrumbClick(-1)}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              {language === 'ko' ? '전체' : 'All'}
            </button>
            {currentPath.map((path, idx) => (
              <span key={idx} className="flex items-center gap-2">
                <span className="text-gray-400">&gt;</span>
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {path}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Treemap 차트 - COMPACT 모드 */}
        <div 
          className={`transition-all duration-[160ms] ease-out ${
            isTransitioning ? 'opacity-0 translate-y-1.5' : 'opacity-100 translate-y-0'
          }`}
        >
          <ResponsiveContainer width="100%" height={350}>
            <Treemap
              data={displayData}
              dataKey="value"
              aspectRatio={4 / 3}
              stroke="#fff"
              content={createCustomizedContent('compact')}
              isAnimationActive={false}
              animationDuration={0}
            >
              <Tooltip content={<CustomTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>

        {/* 범례 */}
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>{language === 'ko' ? '빨강: 할인 증가' : 'Red: Discount ↑'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>{language === 'ko' ? '파랑: 할인 감소' : 'Blue: Discount ↓'}</span>
          </div>
          {displayData.length > 0 && (
            <span className="ml-auto font-medium">
              {language === 'ko' ? '총' : 'Total'}: {displayData.length}{language === 'ko' ? '개 항목' : ' items'}
            </span>
          )}
        </div>
      </div>

      {/* ========== 확대 모달 (DETAIL 모드) ========== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-auto">
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {language === 'ko' ? '카테고리별 매출 구성 (상세)' : 'Sales by Category (Detail)'}
                </h3>
                {data && (
                  <div className="text-sm text-gray-500 mt-1">
                    {language === 'ko' ? '기준일' : 'As of'}: {data.asof_date} ({data.sesn})
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {/* 당월/누적 토글 */}
                <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setMode('monthly')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md ${
                      mode === 'monthly'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {language === 'ko' ? '당월' : 'Monthly'}
                  </button>
                  <button
                    onClick={() => setMode('ytd')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md ${
                      mode === 'ytd'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {language === 'ko' ? '누적' : 'YTD'}
                  </button>
                </div>
                {/* 닫기 버튼 */}
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title={language === 'ko' ? '닫기' : 'Close'}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Breadcrumb */}
            {currentPath.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-sm">
                <button
                  onClick={() => handleBreadcrumbClick(-1)}
                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                >
                  {language === 'ko' ? '전체' : 'All'}
                </button>
                {currentPath.map((path, idx) => (
                  <span key={idx} className="flex items-center gap-2">
                    <span className="text-gray-400">&gt;</span>
                    <button
                      onClick={() => handleBreadcrumbClick(idx)}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      {path}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 모달 차트 - DETAIL 모드 */}
            <div 
              className={`p-6 transition-all duration-[160ms] ease-out ${
                isTransitioning ? 'opacity-0 translate-y-1.5' : 'opacity-100 translate-y-0'
              }`}
            >
              <ResponsiveContainer width="100%" height={600}>
                <Treemap
                  data={displayData}
                  dataKey="value"
                  aspectRatio={4 / 3}
                  stroke="#fff"
                  content={createCustomizedContent('detail')}
                  isAnimationActive={false}
                  animationDuration={0}
                >
                  <Tooltip content={<CustomTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>

            {/* 모달 푸터 */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span>{language === 'ko' ? '할인 증가 (마진 악화)' : 'Discount ↑ (Margin ↓)'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>{language === 'ko' ? '할인 감소 (마진 개선)' : 'Discount ↓ (Margin ↑)'}</span>
                </div>
                {displayData.length > 0 && (
                  <span className="ml-auto font-semibold">
                    {language === 'ko' ? '총' : 'Total'}: {displayData.length}{language === 'ko' ? '개 항목' : ' items'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
