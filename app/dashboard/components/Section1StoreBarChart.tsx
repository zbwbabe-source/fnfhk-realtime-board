'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { t, type Language } from '@/lib/translations';
import {
  calculateSalesPerAreaPerDay,
  getMtdDays,
  getYtdDays,
  formatSalesPerArea,
  canCalculateSalesPerArea,
  getStoreArea,
} from '@/lib/store-area-utils';
import { getStoreShortCode } from '@/lib/store-name-utils';
import { 
  CardShell, 
  CardHeader,
  CardControls,
  CardChartBody, 
  ExpandButton,
  compactSelectClass,
  compactButtonGroupClass,
  compactButtonClass
} from './common/CardShell';

interface StoreBarChartProps {
  region: string;
  brand: string;
  date: string;
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
  discount_rate_mtd: number;
  
  // YTD
  ytd_target: number;
  ytd_act: number;
  progress_ytd: number;
  ytd_act_py: number;
  yoy_ytd: number;
  discount_rate_ytd: number;
}

interface ChartDataPoint {
  name: string; // 원본 매장명 (full name)
  shortCode: string; // 축약 코드 (X축 표시용)
  shop_cd: string;
  sales: number; // 실판매출 또는 평당매출/1일
  yoy_raw: number | null; // 원본 YoY% (툴팁용)
  yoy_clamped: number | null; // 150%로 제한된 YoY% (차트 표시용)
  color: string; // 막대 색상
  area: number | null; // 면적 (평) - 툴팁용
  discountRate: number; // 할인율 (%) - 툴팁용
}

export default function Section1StoreBarChart({ region, brand, date, language }: StoreBarChartProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // 상태 관리
  const [isYtdMode, setIsYtdMode] = useState(false); // false: 당월(MTD), true: 누적(YTD)
  const [showSalesPerArea, setShowSalesPerArea] = useState(false); // false: 실판매출, true: 평당매출
  const [selectedChannel, setSelectedChannel] = useState<string>('전체'); // 전체, HK정상, HK아울렛, 마카오, HK온라인
  const [isModalOpen, setIsModalOpen] = useState(false); // 확대 모달 상태

  // 반응형: 모바일 감지
  const [isMobile, setIsMobile] = useState(false);

  // 디버깅: 차트 영역 높이 확인용 ref
  const chartRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  console.log('📊 Section1StoreBarChart rendered:', { region, brand, date, isYtdMode, showSalesPerArea, selectedChannel, isMobile });

  // 데이터 fetch
  useEffect(() => {
    if (!date) {
      console.log('⚠️ No date provided, skipping fetch');
      return;
    }

    async function fetchData() {
      console.log('📊 Fetching store sales data...');
      setLoading(true);
      setError('');

      try {
        const url = `/api/section1/store-sales?region=${region}&brand=${brand}&date=${date}`;
        console.log('📊 Fetching from URL:', url);
        
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error('Failed to fetch store sales');
        }

        const json = await res.json();
        console.log('📊 Received data:', json);
        setData(json);
      } catch (err: any) {
        console.error('❌ Store sales fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date]);

  // 채널별 색상 매핑
  const channelColors: Record<string, string> = {
    'HK정상': '#93C5FD',
    'HK아울렛': '#FCA5A5',
    '마카오': '#86EFAC',
    'HK온라인': '#C4B5FD',
  };

  // 차트 데이터 준비
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!data || !date) return [];

    const asofDate = new Date(date);
    const daysCount = isYtdMode ? getYtdDays(asofDate) : getMtdDays(asofDate);

    console.log('📅 일수 계산:', { date, isYtdMode, daysCount });

    // 모든 매장 데이터 수집
    const allStores: StoreRow[] = [
      ...(data.hk_normal || []),
      ...(data.hk_outlet || []),
      ...(data.hk_online || []),
      ...(data.mc_normal || []),
      ...(data.mc_outlet || []),
      ...(data.mc_online || []),
    ];

    console.log('📦 전체 매장 데이터:', {
      hk_normal: data.hk_normal?.length || 0,
      hk_outlet: data.hk_outlet?.length || 0,
      hk_online: data.hk_online?.length || 0,
      mc_normal: data.mc_normal?.length || 0,
      mc_outlet: data.mc_outlet?.length || 0,
      mc_online: data.mc_online?.length || 0,
      total: allStores.length,
    });

    // 채널 필터링
    let filteredStores = allStores;
    
    if (selectedChannel !== '전체') {
      filteredStores = allStores.filter(store => {
        // 채널명 매핑: 마카오는 국가명만, HK는 국가+채널
        let storeChannel = '';
        if (store.country === 'MC') {
          storeChannel = '마카오'; // 마카오는 정상/아울렛 구분 없이 '마카오'로 통합
        } else {
          // HK의 경우
          if (store.channel === '온라인') {
            storeChannel = 'HK온라인';
          } else {
            storeChannel = `HK${store.channel}`; // HK정상 또는 HK아울렛
          }
        }
        return storeChannel === selectedChannel;
      });
    }

    console.log('🔍 필터링된 매장:', filteredStores.length, '개', { selectedChannel });

    // 차트 데이터 변환
    const result: ChartDataPoint[] = filteredStores
      .filter(store => {
        // 영업종료 매장 제외: mtd_act와 ytd_act가 모두 0인 경우
        const actualSales = isYtdMode ? store.ytd_act : store.mtd_act;
        return actualSales > 0;
      })
      .map(store => {
      const storeChannel = store.country === 'MC' ? '마카오' : `HK${store.channel}`;
      const color = channelColors[storeChannel] || '#9CA3AF';

      // 실판매출
      const actualSales = isYtdMode ? store.ytd_act : store.mtd_act;
      const yoyRaw = isYtdMode ? store.yoy_ytd : store.yoy;
      
      // YoY clamp: 150% 초과 시 150%로 제한
      const yoyClamped = yoyRaw !== null && yoyRaw !== undefined 
        ? Math.min(yoyRaw, 150) 
        : null;

      // 면적 정보 조회 (툴팁용)
      const area = getStoreArea(store.shop_cd, asofDate);

      // 할인율 (API에서 제공)
      const discountRate = isYtdMode ? (store.discount_rate_ytd || 0) : (store.discount_rate_mtd || 0);

      let sales = actualSales;

      // 평당매출 모드
      if (showSalesPerArea) {
        if (canCalculateSalesPerArea(store.shop_cd, asofDate)) {
          const salesPerArea = calculateSalesPerAreaPerDay(actualSales, store.shop_cd, daysCount, asofDate);
          sales = salesPerArea ?? 0;
        } else {
          // 계산 불가한 매장(온라인 등)은 null 처리 -> 나중에 필터링됨
          return null;
        }
      }

      // 매장명과 축약 코드
      const fullName = store.shop_name || store.shop_cd;
      const shortCode = getStoreShortCode(fullName);

      return {
        name: fullName,
        shortCode,
        shop_cd: store.shop_cd,
        sales,
        yoy_raw: yoyRaw !== null && yoyRaw !== undefined ? yoyRaw : null,
        yoy_clamped: yoyClamped,
        color,
        area,
        discountRate,
      };
    }).filter((item): item is ChartDataPoint => item !== null); // null 제거

    // 매출 높은 순으로 정렬 (채널 순서 고려)
    // 1. 채널별로 그룹화
    const hkNormal = result.filter(r => r.color === channelColors['HK정상']);
    const hkOutlet = result.filter(r => r.color === channelColors['HK아울렛']);
    const macao = result.filter(r => r.color === channelColors['마카오']);
    const hkOnline = result.filter(r => r.color === channelColors['HK온라인']);

    // 2. 각 채널 내에서 매출 높은 순으로 정렬
    hkNormal.sort((a, b) => b.sales - a.sales);
    hkOutlet.sort((a, b) => b.sales - a.sales);
    macao.sort((a, b) => b.sales - a.sales);
    hkOnline.sort((a, b) => b.sales - a.sales);

    // 3. 채널 순서대로 합치기
    const sortedResult = [...hkNormal, ...hkOutlet, ...macao, ...hkOnline];

    console.log('📊 차트 데이터 생성 완료:', sortedResult.length, '개');
    console.log('샘플:', sortedResult.slice(0, 3));

    return sortedResult;
  }, [data, date, isYtdMode, showSalesPerArea, selectedChannel]);

  // 평당매출 모드 전환 시 온라인 채널 경고
  const canShowSalesPerArea = useMemo(() => {
    if (selectedChannel === 'HK온라인') {
      return false;
    }
    return true;
  }, [selectedChannel]);

  // 기본 화면용 데이터 (TOP N만 표시, OTH 없음)
  const displayData = useMemo(() => {
    if (chartData.length === 0) return [];

    // 모달: 전체 표시
    if (isModalOpen) {
      console.log('📊 모달 모드: 전체 데이터 표시', chartData.length, '개');
      return chartData;
    }

    // 카드: TOP N만 (OTH 없음)
    const topN = isMobile ? 5 : 8;
    const topStores = chartData.slice(0, topN);
    
    console.log('📊 카드 모드: TOP', topN, '개 매장만 표시');
    return topStores;
  }, [chartData, isModalOpen, isMobile]);

  // 디버깅: 차트 영역 높이 확인
  useEffect(() => {
    if (chartRowRef.current && displayData.length > 0) {
      console.log('📏 차트 영역 실제 높이:', chartRowRef.current.clientHeight, 'px');
    }
  }, [displayData]);

  // 숫자 포맷팅
  const formatSales = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toFixed(0);
  };

  const formatYoY = (value: number | null) => {
    if (value === null) return 'N/A';
    return `${value.toFixed(0)}%`;
  };

  // Tooltip 커스텀 (원본 매장명 + 축약 코드 표시)
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload as ChartDataPoint;

    return (
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[200px]">
        <div className="mb-3 pb-2 border-b">
          <p className="text-sm font-semibold text-gray-900">{data.name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">({data.shortCode})</p>
        </div>
        <div className="space-y-2">
          {showSalesPerArea ? (
            // 평당매출/1일 모드
            <>
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }}></div>
                  <span className="text-xs text-gray-600">평당매출/1일:</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {formatSalesPerArea(data.sales)} HKD
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-gray-600">YoY:</span>
                <span className={`text-sm font-semibold ${
                  data.yoy_raw === null ? 'text-gray-400' : 
                  data.yoy_raw >= 100 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatYoY(data.yoy_raw)}
                  {data.yoy_raw !== null && data.yoy_raw > 150 && (
                    <span className="text-xs ml-1 text-orange-500">(차트: 150%)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-gray-600">면적:</span>
                <span className="text-sm font-semibold text-blue-600">
                  {data.area !== null ? `${data.area}평` : 'N/A'}
                </span>
              </div>
            </>
          ) : (
            // 실판매출 모드
            <>
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }}></div>
                  <span className="text-xs text-gray-600">실판매출:</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {formatSales(data.sales)} HKD
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-gray-600">YoY:</span>
                <span className={`text-sm font-semibold ${
                  data.yoy_raw === null ? 'text-gray-400' : 
                  data.yoy_raw >= 100 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatYoY(data.yoy_raw)}
                  {data.yoy_raw !== null && data.yoy_raw > 150 && (
                    <span className="text-xs ml-1 text-orange-500">(차트: 150%)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-gray-600">할인율:</span>
                <span className="text-sm font-semibold text-purple-600">
                  {data.discountRate > 0 ? `${data.discountRate.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="h-[488px] flex items-center justify-center">
          <div className="text-gray-500">
            {language === 'ko' ? '로딩 중...' : 'Loading...'}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="h-[488px] flex items-center justify-center">
          <div className="text-red-500 text-sm">
            {language === 'ko' ? '데이터를 불러오지 못했습니다.' : 'Failed to load data.'}
          </div>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">
          {language === 'ko' ? '매장별 실판매출/평당매출' : 'Store Sales / Sales per Area'}
        </h3>
        <div className="h-[440px] flex items-center justify-center">
          <div className="text-gray-500 text-sm">
            {language === 'ko' ? '데이터가 없습니다.' : 'No data available.'}
          </div>
        </div>
      </div>
    );
  }

  // Y축 범위 계산
  const maxSales = Math.max(...displayData.map(d => d.sales));
  const yoyValues = displayData.filter(d => d.yoy_raw !== null).map(d => d.yoy_raw as number);
  
  // YoY 범위: 최대 150%로 고정
  const maxYoY = 150;
  const minYoY = yoyValues.length > 0 ? Math.min(...yoyValues, 0) : 0;

  return (
    <>
      <CardShell>
      {/* 1단: 헤더 - 제목만 (우측 정렬로 확대 버튼 배치) */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between flex-shrink-0">
        <div>
          <h3 className="text-base font-semibold text-gray-900 leading-tight">
            {language === 'ko' ? '매장별 실판매출/평당매출' : 'Store Sales / Sales per Area'}
          </h3>
          {/* 2단: 기준일 표시 */}
          <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
            {language === 'ko' ? '기준일' : 'As of'}: {date}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 확대 안내 - 클릭 유도 */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 transition-all duration-200 border border-blue-200 hover:border-blue-300"
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
              {language === 'ko' ? '전체 매장 보기' : 'View All Stores'}
            </span>
          </button>
        </div>
      </div>

      {/* 3단: 컨트롤 - 드롭다운/토글 */}
      <div className="px-4 pb-2 flex items-center gap-2 justify-between flex-shrink-0 flex-wrap md:flex-nowrap">
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
          <select
            value={selectedChannel}
            onChange={(e) => {
              setSelectedChannel(e.target.value);
              if (e.target.value === 'HK온라인' && showSalesPerArea) {
                setShowSalesPerArea(false);
              }
            }}
            className={compactSelectClass}
          >
            <option value="전체">전체</option>
            <option value="HK정상">HK정상</option>
            <option value="HK아울렛">HK아울렛</option>
            <option value="마카오">마카오</option>
            <option value="HK온라인">HK온라인</option>
          </select>

          <select
            value={isYtdMode ? 'ytd' : 'mtd'}
            onChange={(e) => setIsYtdMode(e.target.value === 'ytd')}
            className={compactSelectClass}
          >
            <option value="mtd">{language === 'ko' ? '당월' : 'MTD'}</option>
            <option value="ytd">{language === 'ko' ? '누적' : 'YTD'}</option>
          </select>

          <select
            value={showSalesPerArea ? 'per_area' : 'sales'}
            onChange={(e) => setShowSalesPerArea(e.target.value === 'per_area')}
            disabled={!canShowSalesPerArea}
            className={`${compactSelectClass} ${!canShowSalesPerArea ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!canShowSalesPerArea ? '온라인 채널은 평당매출 계산이 불가능합니다' : ''}
          >
            <option value="sales">{language === 'ko' ? '실판매출' : 'Sales'}</option>
            <option value="per_area">{language === 'ko' ? '평당매출/1일' : 'Sales/Area/Day'}</option>
          </select>
        </div>
      </div>

      {/* 경고 메시지 (있을 경우) */}
      {!canShowSalesPerArea && showSalesPerArea && (
        <div className="px-4 pb-1">
          <div className="px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800 leading-tight">
            ⚠️ {language === 'ko' 
              ? '온라인 채널은 면적 데이터가 없어 평당매출을 계산할 수 없습니다.' 
              : 'Online channel does not have area data.'}
          </div>
        </div>
      )}
      
      {/* 4단: 차트 영역 - 남은 공간 전부 사용 (강제 높이 전달) */}
      <div ref={chartRowRef} className="flex-1 min-h-0 w-full px-0 pb-2">
        {/* 범례 - 차트 외부 상단에 고정 */}
        <div className="flex items-center gap-3 flex-wrap px-2 pb-1.5">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#93C5FD' }}></div>
            <span className="text-[9px] text-gray-600">HK정상</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#FCA5A5' }}></div>
            <span className="text-[9px] text-gray-600">HK아울렛</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#86EFAC' }}></div>
            <span className="text-[9px] text-gray-600">마카오</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#C4B5FD' }}></div>
            <span className="text-[9px] text-gray-600">온라인</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-0.5 bg-orange-600"></div>
            <span className="text-[9px] text-gray-600">YoY</span>
          </div>
        </div>
        
        <div className="w-full h-full min-h-0 px-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 8, right: 4, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            
            {/* Legend 제거 - 차트 외부로 이동 */}
            
            {/* X축: 매장 축약 코드 */}
            <XAxis
              dataKey="shortCode"
              stroke="#6b7280"
              style={{ fontSize: '9px', fontWeight: 500 }}
              angle={-12}
              textAnchor="end"
              height={20}
              interval={0}
            />
            
            {/* 왼쪽 Y축: 실판매출 또는 평당매출 */}
            <YAxis
              yAxisId="left"
              stroke="#6b7280"
              style={{ fontSize: '9px' }}
              tickFormatter={(value) => showSalesPerArea ? formatSalesPerArea(value) : formatSales(value)}
              domain={[0, maxSales * 1.1]}
              width={42}
            />
            
            {/* 오른쪽 Y축: YoY% - 0~150% 고정 */}
            <YAxis
              yAxisId="yoy"
              orientation="right"
              stroke="#ea580c"
              style={{ fontSize: '9px' }}
              tickFormatter={(value) => `${Math.round(value)}%`}
              domain={[0, 150]}
              allowDataOverflow={false}
              width={38}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            {/* YoY 100% 기준선 (점선) */}
            <ReferenceLine 
              y={100} 
              yAxisId="yoy"
              stroke="#374151" 
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{ 
                value: '100%', 
                position: 'right',
                fill: '#374151',
                fontSize: 10,
                offset: 5
              }}
            />
            
            {/* 막대그래프: 실판매출 또는 평당매출 */}
            <Bar
              yAxisId="left"
              dataKey="sales"
              fill="#93C5FD"
              radius={[4, 4, 0, 0]}
              shape={(props: any) => {
                const { fill, x, y, width, height, payload } = props;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={payload.color}
                    rx={4}
                    ry={4}
                  />
                );
              }}
            />
            
            {/* 꺾은선: YoY% - clamped 데이터 사용 */}
            <Line
              yAxisId="yoy"
              type="monotone"
              dataKey="yoy_clamped"
              stroke="#ea580c"
              strokeWidth={2}
              dot={{ r: 3, fill: '#ea580c', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
              connectNulls={false}
              strokeOpacity={0.7}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>
    </CardShell>
    
    {/* ========== 확대 모달 ========== */}
    {isModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 md:p-4">
        <div className={`bg-white shadow-2xl w-full h-full flex flex-col ${
          isMobile 
            ? 'rounded-none' 
            : 'rounded-lg max-w-6xl max-h-[90vh]'
        }`}>
          {/* 모달 헤더 - sticky */}
          <div className="sticky top-0 bg-white border-b border-gray-200 z-10 flex-shrink-0">
            <div className={`flex items-center justify-between ${isMobile ? 'p-3' : 'p-4'}`}>
              <div>
                <h3 className={`font-semibold text-gray-900 ${isMobile ? 'text-base' : 'text-xl'}`}>
                  {language === 'ko' ? '매장별 실판매출/평당매출 (상세)' : 'Store Sales / Sales per Area (Detail)'}
                </h3>
                <p className={`text-gray-500 mt-0.5 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  {language === 'ko' ? `기준일: ${date}` : `As of: ${date}`}
                </p>
              </div>
              
              {/* 닫기 버튼 */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title={language === 'ko' ? '닫기' : 'Close'}
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* 모달 컨트롤 */}
            <div className={`flex items-center gap-2 border-t border-gray-100 ${
              isMobile ? 'p-2 flex-wrap' : 'px-4 py-3'
            }`}>
              {/* 드롭다운 1: 채널 선택 */}
              <select
                value={selectedChannel}
                onChange={(e) => {
                  setSelectedChannel(e.target.value);
                  if (e.target.value === 'HK온라인' && showSalesPerArea) {
                    setShowSalesPerArea(false);
                  }
                }}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="전체">전체</option>
                <option value="HK정상">HK정상</option>
                <option value="HK아울렛">HK아울렛</option>
                <option value="마카오">마카오</option>
                <option value="HK온라인">HK온라인</option>
              </select>

              {/* 드롭다운 2: 당월/누적 */}
              <select
                value={isYtdMode ? 'ytd' : 'mtd'}
                onChange={(e) => setIsYtdMode(e.target.value === 'ytd')}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="mtd">{language === 'ko' ? '당월' : 'MTD'}</option>
                <option value="ytd">{language === 'ko' ? '누적' : 'YTD'}</option>
              </select>

              {/* 드롭다운 3: 실판매출/평당매출 */}
              <select
                value={showSalesPerArea ? 'per_area' : 'sales'}
                onChange={(e) => setShowSalesPerArea(e.target.value === 'per_area')}
                disabled={!canShowSalesPerArea}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  canShowSalesPerArea ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <option value="sales">{language === 'ko' ? '실판매출' : 'Sales'}</option>
                <option value="per_area">{language === 'ko' ? '평당매출/1일' : 'Sales/Area/Day'}</option>
              </select>
            </div>
            
            {/* 모바일 스크롤 안내 */}
            {isMobile && displayData.length > 5 && (
              <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100">
                <p className="text-[10px] text-blue-700 text-center">
                  👈 {language === 'ko' ? '좌우로 스크롤하여 전체 매장 확인' : 'Scroll left/right to see all stores'} 👉
                </p>
              </div>
            )}
          </div>

          {/* 모달 차트 - 가로 스크롤 가능 */}
          <div className="flex-1 min-h-0 overflow-auto">
            <div className={isMobile ? 'p-2 min-w-max' : 'p-6'}>
              {isMobile ? (
                // 모바일: 동적 너비로 가로 스크롤
                <div style={{ width: Math.max(displayData.length * 50, 320), height: '100%', minHeight: 400 }}>
                  <ComposedChart 
                    data={displayData} 
                    width={Math.max(displayData.length * 50, 320)}
                    height={400}
                    margin={{ top: 10, right: 40, left: 10, bottom: 60 }}
                  >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                
                {/* X축: 매장 축약 코드 (모달에서는 30도 사선) */}
                <XAxis
                  dataKey="shortCode"
                  stroke="#6b7280"
                  style={{ fontSize: '12px', fontWeight: 500 }}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  interval={0}
                />
                
                {/* 왼쪽 Y축: 실판매출 또는 평당매출 */}
                <YAxis
                  yAxisId="left"
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => showSalesPerArea ? formatSalesPerArea(value) : formatSales(value)}
                  domain={[0, maxSales * 1.1]}
                  label={{
                    value: showSalesPerArea 
                      ? (language === 'ko' ? '평당매출/1일 (HKD/평/일)' : 'Sales/Area/Day (HKD)')
                      : (language === 'ko' ? '실판매출 (HKD)' : 'Sales (HKD)'),
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: '12px', fill: '#6b7280' }
                  }}
                />
                
                {/* 오른쪽 Y축: YoY% - 0~150% 고정 */}
                <YAxis
                  yAxisId="yoy"
                  orientation="right"
                  stroke="#ea580c"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => `${Math.round(value)}%`}
                  domain={[0, 150]}
                  allowDataOverflow={false}
                  label={{
                    value: 'YoY (%)',
                    angle: 90,
                    position: 'insideRight',
                    style: { fontSize: '12px', fill: '#ea580c' }
                  }}
                />
                
                <Tooltip content={<CustomTooltip />} />
                
                {/* YoY 100% 기준선 (점선) */}
                <ReferenceLine 
                  y={100} 
                  yAxisId="yoy"
                  stroke="#374151" 
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{ 
                    value: '100%', 
                    position: 'right',
                    fill: '#374151',
                    fontSize: 11,
                    offset: 5
                  }}
                />
                
                {/* 막대그래프: 실판매출 또는 평당매출 */}
                <Bar
                  yAxisId="left"
                  dataKey="sales"
                  fill="#93C5FD"
                  radius={[4, 4, 0, 0]}
                  shape={(props: any) => {
                    const { fill, x, y, width, height, payload } = props;
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={payload.color}
                        rx={4}
                        ry={4}
                      />
                    );
                  }}
                />
                
                {/* 꺾은선: YoY% - clamped 데이터 사용 */}
                <Line
                  yAxisId="yoy"
                  type="monotone"
                  dataKey="yoy_clamped"
                  stroke="#ea580c"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#ea580c', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
                  connectNulls={false}
                  strokeOpacity={0.7}
                />
              </ComposedChart>
                </div>
              ) : (
                // 데스크톱: ResponsiveContainer 사용
                <ResponsiveContainer width="100%" height={650}>
                  <ComposedChart data={displayData} margin={{ top: 10, right: 50, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    
                    <XAxis
                      dataKey="shortCode"
                      stroke="#6b7280"
                      style={{ fontSize: '12px', fontWeight: 500 }}
                      angle={-30}
                      textAnchor="end"
                      height={70}
                      interval={0}
                    />
                    
                    <YAxis
                      yAxisId="left"
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => showSalesPerArea ? formatSalesPerArea(value) : formatSales(value)}
                      domain={[0, maxSales * 1.1]}
                      label={{
                        value: showSalesPerArea 
                          ? (language === 'ko' ? '평당매출/1일 (HKD/평/일)' : 'Sales/Area/Day (HKD)')
                          : (language === 'ko' ? '실판매출 (HKD)' : 'Sales (HKD)'),
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: '12px', fill: '#6b7280' }
                      }}
                    />
                    
                    <YAxis
                      yAxisId="yoy"
                      orientation="right"
                      stroke="#ea580c"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => `${Math.round(value)}%`}
                      domain={[0, 150]}
                      allowDataOverflow={false}
                      label={{
                        value: 'YoY (%)',
                        angle: 90,
                        position: 'insideRight',
                        style: { fontSize: '12px', fill: '#ea580c' }
                      }}
                    />
                    
                    <Tooltip content={<CustomTooltip />} />
                    
                    <ReferenceLine 
                      y={100} 
                      yAxisId="yoy"
                      stroke="#374151" 
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                      label={{ 
                        value: '100%', 
                        position: 'right',
                        fill: '#374151',
                        fontSize: 11,
                        offset: 5
                      }}
                    />
                    
                    <Bar
                      yAxisId="left"
                      dataKey="sales"
                      fill="#93C5FD"
                      radius={[4, 4, 0, 0]}
                      shape={(props: any) => {
                        const { fill, x, y, width, height, payload } = props;
                        return (
                          <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill={payload.color}
                            rx={4}
                            ry={4}
                          />
                        );
                      }}
                    />
                    
                    <Line
                      yAxisId="yoy"
                      type="monotone"
                      dataKey="yoy_clamped"
                      stroke="#ea580c"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#ea580c', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
                      connectNulls={false}
                      strokeOpacity={0.7}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          
          {/* 모달 하단 범례 - 데스크톱만 */}
          {!isMobile && (
            <div className="px-6 pb-6 flex items-center justify-center gap-6 flex-wrap flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#93C5FD' }}></div>
                <span className="text-sm text-gray-700">HK정상</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FCA5A5' }}></div>
                <span className="text-sm text-gray-700">HK아울렛</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#86EFAC' }}></div>
                <span className="text-sm text-gray-700">마카오</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#C4B5FD' }}></div>
                <span className="text-sm text-gray-700">HK온라인</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-orange-600"></div>
                <span className="text-sm text-gray-700">YoY %</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
