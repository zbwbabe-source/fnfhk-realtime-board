'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { type Language } from '@/lib/translations';
import { getColorByLargeCategory } from '@/lib/category-utils';
import { 
  CardShell, 
  CardHeader,
  CardControls,
  CardChartBody, 
  ExpandButton,
  compactButtonGroupClass,
  compactButtonClass
} from './common/CardShell';

interface TreemapProps {
  region: string;
  brand: string;
  date: string;
  language: Language;
}

interface SmallCategory {
  code: string;
  sales_tag: number;
  sales_act: number;
  sales_pct: number;
  discount_rate: number;
  discount_rate_ly: number;
  discount_rate_diff: number;
  yoy: number | null;
}

interface MiddleCategory {
  name: string;
  sales_tag: number;
  sales_act: number;
  sales_pct: number;
  discount_rate: number;
  discount_rate_ly: number;
  discount_rate_diff: number;
  yoy: number | null;
  small_categories: SmallCategory[];
}

interface LargeCategory {
  name: string;
  sales_tag: number;
  sales_act: number;
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
  total_sales_tag: number;
  total_sales_act: number;
  large_categories: LargeCategory[];
}

type TreemapMode = 'compact' | 'detail';

export default function Section2Treemap({ region, brand, date, language }: TreemapProps) {
  const [mode, setMode] = useState<'monthly' | 'ytd'>('monthly');
  const [monthlyData, setMonthlyData] = useState<TreemapData | null>(null);
  const [ytdData, setYtdData] = useState<TreemapData | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Get current data based on mode
  const data = mode === 'monthly' ? monthlyData : ytdData;

  // Reset cached data when region, brand, or date changes
  useEffect(() => {
    setMonthlyData(null);
    setYtdData(null);
    setCurrentPath([]);
  }, [region, brand, date]);

  useEffect(() => {
    if (!date) return;

    // Check if data is already cached for this mode
    if (data) {
      console.log(`✅ Using cached ${mode} data`);
      return;
    }

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
        
        // Store in the appropriate cache based on mode
        if (mode === 'monthly') {
          setMonthlyData(json);
        } else {
          setYtdData(json);
        }
        
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
  }, [region, brand, date, mode, data]);

  // 드릴다운 데이터 계산 (비중 조정 로직 포함)
  const displayData = useMemo(() => {
    if (!data) return [];

    let rawData: any[] = [];

    if (currentPath.length === 0) {
      // 대분류
      rawData = data.large_categories.map(large => ({
        name: large.name,
        value: large.sales_act,
        sales_tag: large.sales_tag,
        sales_act: large.sales_act,
        sales_pct: large.sales_pct,
        discount_rate: large.discount_rate,
        discount_rate_diff: large.discount_rate_diff,
        yoy: large.yoy,
      }));
    } else {
      // 소분류 (중분류 건너뛰고 바로 소분류)
      const large = data.large_categories.find(l => l.name === currentPath[0]);
      if (!large) return [];
      
      // 모든 중분류의 소분류를 합침
      const allSmallCategories: any[] = [];
      large.middle_categories.forEach(middle => {
        middle.small_categories.forEach(small => {
          allSmallCategories.push({
            name: small.code,
            value: small.sales_act,
            sales_tag: small.sales_tag,
            sales_act: small.sales_act,
            sales_pct: small.sales_pct,
            discount_rate: small.discount_rate,
            discount_rate_diff: small.discount_rate_diff,
            yoy: small.yoy,
          });
        });
      });
      rawData = allSmallCategories;
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
  const createCustomizedContent = useCallback((treemapMode: TreemapMode) => {
    return (props: any): JSX.Element => {
      const { x, y, width, height, name, value, sales_tag, sales_act, sales_pct, discount_rate, discount_rate_diff, yoy } = props;

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
                  if (currentPath.length < 1) {
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
              x={x + 6}
              y={y + height / 2}
              textAnchor="start"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ 
                fontWeight: 500, 
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                textShadow: 'none', 
                filter: 'none' 
              }}
            >
              <tspan x={x + 6} dy="-0.5em" fontSize="14">
                {name}
              </tspan>
              <tspan x={x + 6} dy="1.5em" fontSize="13">
                {yoy ? `YoY ${yoy.toFixed(0)}%` : 'N/A'}
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
                if (currentPath.length < 1) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + 8}
              y={y + height / 2}
              textAnchor="start"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ 
                fontWeight: 500, 
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                textShadow: 'none', 
                filter: 'none' 
              }}
            >
              <tspan x={x + 8} dy="-4.5em" fontSize="18" fontWeight="600">
                {name}
              </tspan>
              <tspan x={x + 8} dy="1.8em" fontSize="15">
                {language === 'ko' ? '택매출' : 'Tag'}: {formatSales(sales_tag || 0)}
              </tspan>
              <tspan x={x + 8} dy="1.5em" fontSize="15">
                {language === 'ko' ? '실판매출' : 'Actual'}: {formatSales(sales_act || 0)}
              </tspan>
              <tspan x={x + 8} dy="1.5em" fontSize="14">
                YoY: {yoy ? yoy.toFixed(0) : 'N/A'}%
              </tspan>
              <tspan x={x + 8} dy="1.5em" fontSize="14">
                {language === 'ko' ? '할인율' : 'Discount'}: {discount_rate?.toFixed(1)}%
              </tspan>
              <tspan 
                x={x + 8} 
                dy="1.4em" 
                fontSize="13"
                fill={discountColor}
              >
                ({discountSymbol}{Math.abs(discount_rate_diff || 0).toFixed(1)}%p)
              </tspan>
              <tspan x={x + 8} dy="1.5em" fontSize="14">
                {language === 'ko' ? '비중' : 'Share'}: {sales_pct?.toFixed(1)}%
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
                if (currentPath.length < 1) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + 6}
              y={y + height / 2}
              textAnchor="start"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ 
                fontWeight: 500, 
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                textShadow: 'none', 
                filter: 'none' 
              }}
            >
              <tspan x={x + 6} dy="-3em" fontSize="15" fontWeight="600">
                {name}
              </tspan>
              <tspan x={x + 6} dy="1.5em" fontSize="13">
                {language === 'ko' ? '택' : 'Tag'}: {formatSales(sales_tag || 0)}
              </tspan>
              <tspan x={x + 6} dy="1.3em" fontSize="13">
                {language === 'ko' ? '실판' : 'Act'}: {formatSales(sales_act || 0)}
              </tspan>
              <tspan x={x + 6} dy="1.3em" fontSize="12">
                YoY: {yoy ? yoy.toFixed(0) : 'N/A'}%
              </tspan>
              <tspan x={x + 6} dy="1.2em" fontSize="12">
                {language === 'ko' ? '할인' : 'Disc'}: {discount_rate?.toFixed(1)}%
              </tspan>
              <tspan 
                x={x + 6} 
                dy="1.2em" 
                fontSize="11"
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
                if (currentPath.length < 1) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + 5}
              y={y + height / 2}
              textAnchor="start"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ 
                fontWeight: 500, 
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                textShadow: 'none', 
                filter: 'none' 
              }}
            >
              <tspan x={x + 5} dy="-2em" fontSize="13" fontWeight="600">
                {name}
              </tspan>
              <tspan x={x + 5} dy="1.4em" fontSize="11">
                {formatSales(sales_act || 0)}
              </tspan>
              <tspan x={x + 5} dy="1.2em" fontSize="10">
                YoY: {yoy ? yoy.toFixed(0) : 'N/A'}%
              </tspan>
              <tspan x={x + 5} dy="1.2em" fontSize="10">
                {discount_rate?.toFixed(1)}%
              </tspan>
            </text>
          </g>
        );
      }

      // 소형 셀 (40-70px): 이름과 YoY만
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
                if (currentPath.length < 1) {
                  setCurrentPath([...currentPath, name]);
                }
              }}
            />
            <text
              x={x + 4}
              y={y + height / 2}
              textAnchor="start"
              fill="#111"
              stroke="none"
              strokeWidth={0}
              style={{ 
                fontWeight: 500, 
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                textShadow: 'none', 
                filter: 'none' 
              }}
            >
              <tspan x={x + 4} dy="-0.5em" fontSize="11">
                {name}
              </tspan>
              <tspan x={x + 4} dy="1.3em" fontSize="10">
                {yoy ? `${yoy.toFixed(0)}%` : 'N/A'}
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
            className="cursor-pointer"
            onClick={() => {
              if (currentPath.length < 1) {
                setCurrentPath([...currentPath, name]);
              }
            }}
          />
        </g>
      );
    };
  }, [currentPath, language, data]);

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const discountColor = data.discount_rate_diff > 0 ? '#DC2626' : '#2563EB';
    const discountSymbol = data.discount_rate_diff > 0 ? '+' : '';

    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-300 text-sm">
        <div className="font-bold text-gray-900 mb-3 text-base">{data.name}</div>
        <div className="space-y-1.5 text-gray-700">
          <div>
            <span className="font-semibold">{language === 'ko' ? '택매출' : 'Tag Sales'}:</span>{' '}
            {formatSales(data.sales_tag || 0)}
            {data.yoy && (
              <span className="ml-2 text-blue-600">
                (YoY {data.yoy.toFixed(0)}%)
              </span>
            )}
          </div>
          <div>
            <span className="font-semibold">{language === 'ko' ? '실판매출' : 'Actual Sales'}:</span>{' '}
            {formatSales(data.sales_act || 0)}
            {data.yoy && (
              <span className="ml-2 text-blue-600">
                (YoY {data.yoy.toFixed(0)}%)
              </span>
            )}
          </div>
          <div>
            <span className="font-semibold">{language === 'ko' ? '할인율' : 'Discount'}:</span>{' '}
            {data.discount_rate?.toFixed(1)}%
            <span style={{ color: discountColor, fontWeight: 'bold', marginLeft: '6px' }}>
              ({discountSymbol}{data.discount_rate_diff?.toFixed(1)}%p)
            </span>
          </div>
          <div>
            <span className="font-semibold">{language === 'ko' ? '비중' : 'Share'}:</span>{' '}
            {data.sales_pct?.toFixed(1)}%
          </div>
        </div>
      </div>
    );
  };

  // Show error if no data at all
  if (error && !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-[350px] text-red-500">
          {error}
        </div>
      </div>
    );
  }

  // Show initial loading state if no data
  if (loading && !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-[350px] text-gray-500">
          {language === 'ko' ? '로딩 중...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ========== 기본 카드 (COMPACT 모드) ========== */}
      <CardShell>
        {/* Loading overlay */}
        {loading && data && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-lg">
            <div className="bg-white px-3 py-1.5 rounded shadow-lg border border-gray-200">
              <span className="text-xs text-gray-700">
                {language === 'ko' ? '업데이트 중...' : 'Updating...'}
              </span>
            </div>
          </div>
        )}
        
        {/* 1단: 헤더 - 제목 + 기준일 + 상세보기 버튼 */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900 leading-tight">
              {language === 'ko' ? '카테고리별 매출 구성' : 'Sales by Category'}
            </h3>
            {data && (
              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                {language === 'ko' ? '기준일' : 'As of'}: {data.asof_date} ({data.sesn})
              </div>
            )}
          </div>
          
          {/* 상세보기 버튼 - 우측 끝 정렬 */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 transition-all duration-200 border border-blue-200 hover:border-blue-300 flex-shrink-0"
          >
            <svg 
              className="w-3 h-3 text-blue-600 group-hover:scale-110 transition-transform" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
            <span className="text-[10px] font-medium text-blue-700 group-hover:text-blue-800 whitespace-nowrap">
              {language === 'ko' ? '상세 보기' : 'View Details'}
            </span>
          </button>
        </div>

        {/* 2단: 컨트롤 - 당월/누적 토글 */}
        <CardControls>
          <div className={compactButtonGroupClass}>
            <button
              onClick={() => setMode('monthly')}
              className={compactButtonClass(mode === 'monthly')}
            >
              {language === 'ko' ? '당월' : 'MTD'}
            </button>
            <button
              onClick={() => setMode('ytd')}
              className={compactButtonClass(mode === 'ytd')}
            >
              {language === 'ko' ? '누적' : 'YTD'}
            </button>
          </div>

          {/* Breadcrumb (컨트롤 라인에 통합) */}
          {currentPath.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-gray-400">|</span>
              <button
                onClick={() => handleBreadcrumbClick(-1)}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                {language === 'ko' ? '전체' : 'All'}
              </button>
              {currentPath.map((path, idx) => (
                <span key={idx} className="flex items-center gap-1.5">
                  <span className="text-gray-400">&gt;</span>
                  <button
                    onClick={() => handleBreadcrumbClick(idx)}
                    className="text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[80px]"
                  >
                    {path}
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardControls>

        {/* 3단: 차트 영역 - 남은 공간 전부 사용 */}
        <CardChartBody 
          className={`transition-all duration-[160ms] ease-out ${
            isTransitioning ? 'opacity-0 translate-y-1.5' : 'opacity-100 translate-y-0'
          }`}
        >
          <ResponsiveContainer width="100%" height="100%">
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
        </CardChartBody>
      </CardShell>

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
                  {/* 확대 모달에서는 툴팁 제거 - 정보가 블록 안에 직접 표시됨 */}
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
