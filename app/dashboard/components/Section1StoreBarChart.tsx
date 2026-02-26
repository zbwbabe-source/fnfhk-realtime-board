'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Scatter, Cell, Text } from 'recharts';
import { t, type Language } from '@/lib/translations';
import { isNewStore, getYoYForChart } from '@/lib/new-store-utils';
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
  latestDate?: string;
  section1Data?: any;
  disableFetch?: boolean;
  language: Language;
  currencyCode?: 'HKD' | 'TWD';
  hkdToTwdRate?: number;
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
  channelKey: string;
  sales: number; // 실판매출 또는 평당매출/1일
  yoy_raw: number | null; // 원본 YoY% (툴팁용)
  yoy_clamped: number | null; // 150%로 제한된 YoY% (차트 표시용)
  color: string; // 막대 색상
  area: number | null; // 면적 (평) - 툴팁용
  discountRate: number; // 할인율 (%) - 툴팁용
  py_value: number; // 전년 매출 - 신규 매장 판별용
}

const ALL_CHANNEL = '전체';

const channelLabels: Record<string, { ko: string; en: string }> = {
  [ALL_CHANNEL]: { ko: '전체', en: 'All' },
  'HK정상': { ko: 'HK 정상', en: 'HK Retail' },
  'HK아울렛': { ko: 'HK 아울렛', en: 'HK Outlet' },
  'MC정상': { ko: 'MC 정상', en: 'MC Retail' },
  'MC아울렛': { ko: 'MC 아울렛', en: 'MC Outlet' },
  'HK온라인': { ko: 'HK 온라인', en: 'HK Online' },
  'TW정상': { ko: 'TW 정상', en: 'TW Retail' },
  'TW아울렛': { ko: 'TW 아울렛', en: 'TW Outlet' },
  'TW온라인': { ko: 'TW 온라인', en: 'TW Online' },
};

export default function Section1StoreBarChart({
  region,
  brand,
  date,
  latestDate,
  section1Data,
  disableFetch = false,
  language,
  currencyCode = 'HKD',
  hkdToTwdRate = 1,
}: StoreBarChartProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // 상태 관리
  const [isYtdMode, setIsYtdMode] = useState(false); // false: 당월(MTD), true: 누적(YTD)
  const [showSalesPerArea, setShowSalesPerArea] = useState(false); // false: 실판매출, true: 평당매출
  const [selectedChannel, setSelectedChannel] = useState<string>(ALL_CHANNEL); // 전체, HK정상, HK아울렛, MC정상, MC아울렛, HK온라인, TW정상, TW아울렛, TW온라인
  const [isModalOpen, setIsModalOpen] = useState(false); // 확대 모달 상태
  const [yoyAxisMax, setYoyAxisMax] = useState<100 | 150 | 200 | 300 | 400 | 500>(150); // YoY 축 최대값

  // 반응형: 모바일 감지
  const [isMobile, setIsMobile] = useState(false);
  const displayMultiplier = region === 'TW' && currencyCode === 'TWD' ? hkdToTwdRate : 1;
  const getChannelLabel = (key: string) => channelLabels[key]?.[language] ?? key;
  const getYoyAxisOptionLabel = (value: number) =>
    language === 'ko' ? `보조축: ${value}%` : `Secondary Axis: ${value}%`;

  // 디버깅: 차트 영역 높이 확인용 ref
  const chartRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Region 변경 시 채널 필터 리셋
  useEffect(() => {
    setSelectedChannel(ALL_CHANNEL);
  }, [region]);

  useEffect(() => {
    if (!section1Data) return;
    setData(section1Data);
    setLoading(false);
    setError('');
  }, [section1Data]);

  console.log('📊 Section1StoreBarChart rendered:', { region, brand, date, isYtdMode, showSalesPerArea, selectedChannel, isMobile });

  // 데이터 fetch
  useEffect(() => {
    if (!date) {
      console.log('⚠️ No date provided, skipping fetch');
      return;
    }
    if (disableFetch) return;
    if (section1Data) return;

    async function fetchData() {
      console.log('📊 Fetching store sales data...');
      setLoading(true);
      setError('');

      try {
        const url = `/api/section1/store-sales?region=${region}&brand=${brand}&date=${date}`;
        console.log('📊 Fetching from URL:', url);

        const isLatestDate = !!latestDate && date === latestDate;
        const finalUrl = `${url}${isLatestDate ? '&forceRefresh=true' : ''}`;
        const res = await fetch(finalUrl, isLatestDate ? { cache: 'no-store' } : undefined);

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
  }, [region, brand, date, latestDate, section1Data, disableFetch]);

  // 채널별 색상 매핑
  const channelColors: Record<string, string> = {
    'HK정상': '#93C5FD',
    'HK아울렛': '#FCA5A5',
    'MC정상': '#86EFAC',
    'MC아울렛': '#FB923C',
    'HK온라인': '#C4B5FD',
    'TW정상': '#FDE047',
    'TW아울렛': '#FDA4AF',
    'TW온라인': '#D8B4FE',
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
      ...(data.tw_normal || []),
      ...(data.tw_outlet || []),
      ...(data.tw_online || []),
    ];

    console.log('📦 전체 매장 데이터:', {
      hk_normal: data.hk_normal?.length || 0,
      hk_outlet: data.hk_outlet?.length || 0,
      hk_online: data.hk_online?.length || 0,
      mc_normal: data.mc_normal?.length || 0,
      mc_outlet: data.mc_outlet?.length || 0,
      mc_online: data.mc_online?.length || 0,
      tw_normal: data.tw_normal?.length || 0,
      tw_outlet: data.tw_outlet?.length || 0,
      tw_online: data.tw_online?.length || 0,
      total: allStores.length,
    });

    // 채널 필터링
    let filteredStores = allStores;
    
    if (selectedChannel !== ALL_CHANNEL) {
      filteredStores = allStores.filter(store => {
        // 채널명 매핑
        let storeChannel = '';
        if (store.country === 'MC') {
          storeChannel = store.shop_cd === 'MC4' || store.channel === '아울렛' ? 'MC아울렛' : 'MC정상';
        } else if (store.country === 'TW') {
          // TW의 경우
          if (store.channel === '온라인') {
            storeChannel = 'TW온라인';
          } else {
            storeChannel = `TW${store.channel}`; // TW정상 또는 TW아울렛
          }
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
      // 채널명 매핑
      let storeChannel = '';
      if (store.country === 'MC') {
        storeChannel = store.shop_cd === 'MC4' || store.channel === '아울렛' ? 'MC아울렛' : 'MC정상';
      } else if (store.country === 'TW') {
        if (store.channel === '온라인') {
          storeChannel = 'TW온라인';
        } else {
          storeChannel = `TW${store.channel}`;
        }
      } else {
        // HK
        if (store.channel === '온라인') {
          storeChannel = 'HK온라인';
        } else {
          storeChannel = `HK${store.channel}`;
        }
      }
      
      const color = channelColors[storeChannel] || '#9CA3AF';

      // 실판매출
      const actualSales = isYtdMode ? store.ytd_act : store.mtd_act;
      const actualPyValue = isYtdMode ? store.ytd_act_py : store.mtd_act_py;
      const yoyRaw = isYtdMode ? store.yoy_ytd : store.yoy;
      
      // 신규 매장은 YoY를 null로 처리 (전년 매출 기준)
      const yoyRawAdjusted = getYoYForChart(actualPyValue, yoyRaw);
      
      // YoY clamp: yoyAxisMax 초과 시 제한
      const yoyClamped = yoyRawAdjusted !== null && yoyRawAdjusted !== undefined 
        ? Math.min(yoyRawAdjusted, yoyAxisMax) 
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
      const fullName = store.shop_cd === 'MC4' ? 'Senado Outlet' : (store.shop_name || store.shop_cd);
      const shortCode = store.shop_cd === 'MC4' ? 'SNO' : getStoreShortCode(fullName);

      return {
        name: fullName,
        shortCode,
        shop_cd: store.shop_cd,
        channelKey: storeChannel,
        sales,
        yoy_raw: yoyRawAdjusted,
        yoy_clamped: yoyClamped,
        color,
        area,
        discountRate,
        py_value: actualPyValue, // 전년 매출 추가 (신규 매장 판별용)
      };
    }).filter((item): item is ChartDataPoint => item !== null); // null 제거

    // 매출 높은 순으로 정렬 (채널 순서 고려)
    // 1. 채널별로 그룹화
    const hkNormal = result.filter(r => r.channelKey === 'HK정상');
    const hkOutlet = result.filter(r => r.channelKey === 'HK아울렛');
    const mcNormal = result.filter(r => r.channelKey === 'MC정상');
    const mcOutlet = result.filter(r => r.channelKey === 'MC아울렛');
    const hkOnline = result.filter(r => r.channelKey === 'HK온라인');
    const twNormal = result.filter(r => r.channelKey === 'TW정상');
    const twOutlet = result.filter(r => r.channelKey === 'TW아울렛');
    const twOnline = result.filter(r => r.channelKey === 'TW온라인');

    // 2. 각 채널 내에서 매출 높은 순으로 정렬
    hkNormal.sort((a, b) => b.sales - a.sales);
    hkOutlet.sort((a, b) => b.sales - a.sales);
    mcNormal.sort((a, b) => b.sales - a.sales);
    mcOutlet.sort((a, b) => b.sales - a.sales);
    hkOnline.sort((a, b) => b.sales - a.sales);
    twNormal.sort((a, b) => b.sales - a.sales);
    twOutlet.sort((a, b) => b.sales - a.sales);
    twOnline.sort((a, b) => b.sales - a.sales);

    // 3. 채널 순서대로 합치기 (MC아울렛은 LDN 다음)
    let mcOrdered = [...mcNormal];
    if (mcOutlet.length > 0) {
      const ldnIndex = mcOrdered.findIndex((row) => row.shortCode === 'LDN' || row.shop_cd === 'MC2');
      if (ldnIndex >= 0) {
        mcOrdered = [
          ...mcOrdered.slice(0, ldnIndex + 1),
          ...mcOutlet,
          ...mcOrdered.slice(ldnIndex + 1),
        ];
      } else {
        mcOrdered = [...mcOrdered, ...mcOutlet];
      }
    }
    const sortedResult = [...hkNormal, ...hkOutlet, ...mcOrdered, ...hkOnline, ...twNormal, ...twOutlet, ...twOnline];

    console.log('📊 차트 데이터 생성 완료:', sortedResult.length, '개');
    console.log('샘플:', sortedResult.slice(0, 3));

    return sortedResult;
  }, [data, date, isYtdMode, showSalesPerArea, selectedChannel, yoyAxisMax]);

  // 최적의 YoY 축 범위 자동 선택
  const optimalYoyAxisMax = useMemo(() => {
    if (chartData.length === 0) return 150; // 기본값

    // 모든 매장의 yoy_raw 값 중 최대값 찾기
    const maxYoy = Math.max(
      ...chartData
        .map(d => d.yoy_raw)
        .filter((y): y is number => y !== null && y !== undefined)
    );

    // 최대 YoY 값이 없으면 기본값
    if (!isFinite(maxYoy) || maxYoy <= 0) return 150;

    // 최대값에 여유를 두고 적절한 범위 선택
    if (maxYoy <= 90) return 100;
    if (maxYoy <= 140) return 150;
    if (maxYoy <= 180) return 200;
    if (maxYoy <= 280) return 300;
    if (maxYoy <= 380) return 400;
    return 500;
  }, [chartData]);

  // 데이터가 변경될 때 yoyAxisMax를 자동으로 업데이트
  useEffect(() => {
    setYoyAxisMax(optimalYoyAxisMax);
  }, [optimalYoyAxisMax]);

  // YoY 축 ticks 계산 함수
  const getYoyTicks = (max: 100 | 150 | 200 | 300 | 400 | 500) => {
    if (max === 100) return [0, 25, 50, 75, 100];
    if (max === 150) return [0, 50, 100, 150];
    if (max === 200) return [0, 50, 100, 150, 200];
    if (max === 300) return [0, 100, 200, 300];
    if (max === 400) return [0, 100, 200, 300, 400];
    return [0, 100, 200, 300, 400, 500];
  };

  // 평당매출 모드 전환 시 온라인 채널 경고
  const canShowSalesPerArea = useMemo(() => {
    if (selectedChannel === 'HK온라인' || selectedChannel === 'TW온라인') {
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
    const converted = value * displayMultiplier;
    if (converted >= 1000000) {
      return `${(converted / 1000000).toFixed(1)}M`;
    }
    if (converted >= 1000) {
      return `${(converted / 1000).toFixed(0)}K`;
    }
    return converted.toFixed(0);
  };

  const formatYoYPercent = (value: number | null) => {
    if (value === null) return 'N/A';
    return `${value.toFixed(0)}%`;
  };

  const ytdPeriodLabel = useMemo(() => {
    if (!date) return '';

    const asofDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(asofDate.getTime())) return '';

    const year = asofDate.getFullYear();
    const yearShort = String(year).slice(-2);
    const month = asofDate.getMonth() + 1;
    const day = asofDate.getDate();

    return language === 'ko'
      ? `${yearShort}년 1/1~${month}/${day}`
      : `${year}/1/1~${month}/${day}`;
  }, [date, language]);

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
                  {formatSales(data.sales)} {currencyCode}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-gray-600">YoY:</span>
                <span className={`text-sm font-semibold ${
                  data.yoy_raw === null ? 'text-gray-400' : 
                  data.yoy_raw >= 100 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isNewStore(data.py_value) 
                    ? <span className="text-blue-600">{language === 'ko' ? '신규' : 'New'}</span>
                    : formatYoYPercent(data.yoy_raw)
                  }
                  {data.yoy_raw !== null && data.yoy_raw > yoyAxisMax && !isNewStore(data.py_value) && (
                    <span className="text-xs ml-1 text-orange-500">(차트: {yoyAxisMax}%)</span>
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
                  {formatSales(data.sales)} {currencyCode}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-gray-600">YoY:</span>
                <span className={`text-sm font-semibold ${
                  data.yoy_raw === null ? 'text-gray-400' : 
                  data.yoy_raw >= 100 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isNewStore(data.py_value) 
                    ? <span className="text-blue-600">{language === 'ko' ? '신규' : 'New'}</span>
                    : formatYoYPercent(data.yoy_raw)
                  }
                  {data.yoy_raw !== null && data.yoy_raw > yoyAxisMax && !isNewStore(data.py_value) && (
                    <span className="text-xs ml-1 text-orange-500">(차트: {yoyAxisMax}%)</span>
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
            {isYtdMode && (
              <span className="ml-1 text-orange-600 font-medium">
                * {ytdPeriodLabel}
              </span>
            )}
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
      <div className="px-4 pb-2 flex items-center gap-1.5 justify-between flex-shrink-0 flex-wrap md:flex-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap">
          <select
            value={selectedChannel}
            onChange={(e) => {
              setSelectedChannel(e.target.value);
              if ((e.target.value === 'HK온라인' || e.target.value === 'TW온라인') && showSalesPerArea) {
                setShowSalesPerArea(false);
              }
            }}
            className={compactSelectClass}
          >
            <option value={ALL_CHANNEL}>{getChannelLabel(ALL_CHANNEL)}</option>
            {region === 'HKMC' ? (
              <>
            <option value="HK정상">{getChannelLabel('HK정상')}</option>
            <option value="HK아울렛">{getChannelLabel('HK아울렛')}</option>
            <option value="MC정상">{getChannelLabel('MC정상')}</option>
            <option value="MC아울렛">{getChannelLabel('MC아울렛')}</option>
            <option value="HK온라인">{getChannelLabel('HK온라인')}</option>
              </>
            ) : (
              <>
                <option value="TW정상">{getChannelLabel('TW정상')}</option>
                <option value="TW아울렛">{getChannelLabel('TW아울렛')}</option>
                <option value="TW온라인">{getChannelLabel('TW온라인')}</option>
              </>
            )}
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

          {/* YoY 축 범위 선택 드롭다운 */}
          <select
            value={yoyAxisMax}
            onChange={(e) => setYoyAxisMax(Number(e.target.value) as 100 | 150 | 200 | 300 | 400 | 500)}
            className={compactSelectClass}
          >
            <option value={100}>{getYoyAxisOptionLabel(100)}</option>
            <option value={150}>{getYoyAxisOptionLabel(150)}</option>
            <option value={200}>{getYoyAxisOptionLabel(200)}</option>
            <option value={300}>{getYoyAxisOptionLabel(300)}</option>
            <option value={400}>{getYoyAxisOptionLabel(400)}</option>
            <option value={500}>{getYoyAxisOptionLabel(500)}</option>
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
        {/* 범례 - 차트 외부 상단에 고정 (Region별 동적 표시) */}
        <div className="flex items-center gap-3 flex-wrap px-2 pb-1.5">
          {region === 'HKMC' ? (
            <>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#93C5FD' }}></div>
            <span className="text-[9px] text-gray-600">{getChannelLabel('HK정상')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#FCA5A5' }}></div>
            <span className="text-[9px] text-gray-600">{getChannelLabel('HK아울렛')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#86EFAC' }}></div>
            <span className="text-[9px] text-gray-600">{getChannelLabel('MC정상')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#FB923C' }}></div>
            <span className="text-[9px] text-gray-600">{getChannelLabel('MC아울렛')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#C4B5FD' }}></div>
                <span className="text-[9px] text-gray-600">{getChannelLabel('HK온라인')}</span>
          </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#FDE047' }}></div>
                <span className="text-[9px] text-gray-600">{getChannelLabel('TW정상')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#FDA4AF' }}></div>
                <span className="text-[9px] text-gray-600">{getChannelLabel('TW아울렛')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#D8B4FE' }}></div>
                <span className="text-[9px] text-gray-600">{getChannelLabel('TW온라인')}</span>
              </div>
            </>
          )}
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
            
            {/* 오른쪽 Y축: YoY% - 동적 범위 */}
            <YAxis
              yAxisId="yoy"
              orientation="right"
              stroke="#ea580c"
              style={{ fontSize: '9px' }}
              tickFormatter={(value) => `${Math.round(value)}%`}
              domain={[0, yoyAxisMax]}
              ticks={getYoyTicks(yoyAxisMax)}
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
                const isNew = isNewStore(payload.py_value);
                
                return (
                  <g>
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={payload.color}
                      rx={4}
                      ry={4}
                    />
                    {isNew && (
                      <text
                        x={x + width / 2}
                        y={y - 5}
                        textAnchor="middle"
                        fill="#2563eb"
                        fontSize={9}
                        fontWeight={700}
                      >
                        {language === 'ko' ? '신규' : 'NEW'}
                      </text>
                    )}
                  </g>
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
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (isNewStore(payload.py_value)) {
                  // 신규 매장은 "신규" 텍스트 표시
                  return (
                    <text
                      x={cx}
                      y={cy - 10}
                      textAnchor="middle"
                      fill="#2563eb"
                      fontSize={8}
                      fontWeight={600}
                    >
                      {language === 'ko' ? '신규' : 'NEW'}
                    </text>
                  );
                }
                // 일반 매장은 기본 점
                return <circle cx={cx} cy={cy} r={3} fill="#ea580c" />;
              }}
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
                  {isYtdMode && (
                    <span className="ml-2 text-orange-600 font-medium">
                      * {ytdPeriodLabel}
                    </span>
                  )}
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
                  if ((e.target.value === 'HK온라인' || e.target.value === 'TW온라인') && showSalesPerArea) {
                    setShowSalesPerArea(false);
                  }
                }}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value={ALL_CHANNEL}>{getChannelLabel(ALL_CHANNEL)}</option>
                {region === 'HKMC' ? (
                  <>
                <option value="HK정상">{getChannelLabel('HK정상')}</option>
                <option value="HK아울렛">{getChannelLabel('HK아울렛')}</option>
                <option value="MC정상">{getChannelLabel('MC정상')}</option>
                <option value="MC아울렛">{getChannelLabel('MC아울렛')}</option>
                <option value="HK온라인">{getChannelLabel('HK온라인')}</option>
                  </>
                ) : (
                  <>
                    <option value="TW정상">{getChannelLabel('TW정상')}</option>
                    <option value="TW아울렛">{getChannelLabel('TW아울렛')}</option>
                    <option value="TW온라인">{getChannelLabel('TW온라인')}</option>
                  </>
                )}
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

              {/* YoY 축 범위 선택 드롭다운 */}
              <select
                value={yoyAxisMax}
                onChange={(e) => setYoyAxisMax(Number(e.target.value) as 100 | 150 | 200 | 300 | 400 | 500)}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value={100}>{getYoyAxisOptionLabel(100)}</option>
                <option value={150}>{getYoyAxisOptionLabel(150)}</option>
                <option value={200}>{getYoyAxisOptionLabel(200)}</option>
                <option value={300}>{getYoyAxisOptionLabel(300)}</option>
                <option value={400}>{getYoyAxisOptionLabel(400)}</option>
                <option value={500}>{getYoyAxisOptionLabel(500)}</option>
              </select>
            </div>
          </div>

          {/* 모달 차트 */}
          <div className="flex-1 min-h-0 overflow-auto">
            <div className={isMobile ? 'py-2' : 'p-6'}>
              {isMobile ? (
                // 모바일: 가로형 Bar + YoY Dot + 세로 스크롤
                <div style={{ height: displayData.length * 50 + 120, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={displayData}
                      layout="vertical" // ✅ 가로막대는 vertical
                      margin={{ top: 0, right: 0, left: 0, bottom: 0 }} // ✅ 마진 제거
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />

                      {/* Y축: 매장명 */}
                      <YAxis
                        yAxisId="shops"
                        type="category"
                        dataKey="shortCode"
                        stroke="#6b7280"
                        style={{ fontSize: '11px', fontWeight: 500 }}
                        width={45}
                      />

                      {/* Primary X축: 실판매출 */}
                      <XAxis
                        xAxisId="sales"
                        type="number"
                        orientation="bottom"
                        stroke="#6b7280"
                        style={{ fontSize: '10px' }}
                        tickFormatter={(v) => showSalesPerArea ? formatSalesPerArea(v) : formatSales(v)}
                        domain={[0, 'dataMax']}
                      />

                      {/* Secondary X축: YoY */}
                      <XAxis
                        xAxisId="yoy"
                        type="number"
                        orientation="top"
                        stroke="#ea580c"
                        style={{ fontSize: '10px' }}
                        tickFormatter={(v) => `${Math.round(v)}%`}
                        domain={[0, yoyAxisMax]}
                        ticks={getYoyTicks(yoyAxisMax)}
                      />

                      <Tooltip content={<CustomTooltip />} />

                      {/* YoY 100% 기준선 */}
                      <ReferenceLine
                        xAxisId="yoy"
                        x={100}
                        stroke="#000"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      />

                      {/* 가로 막대: 실판매출 */}
                      <Bar
                        xAxisId="sales"
                        yAxisId="shops"
                        dataKey="sales"
                        fill="#93c5fd"
                        radius={[0, 4, 4, 0]}
                        barSize={35}
                        shape={(props: any) => {
                          const { fill, x, y, width, height, payload } = props;
                          const isNew = isNewStore(payload.py_value);
                          
                          return (
                            <g>
                              <rect
                                x={x}
                                y={y}
                                width={width}
                                height={height}
                                fill={payload.color}
                                rx={4}
                                ry={4}
                              />
                              {isNew && (
                                <text
                                  x={x + width + 5}
                                  y={y + height / 2}
                                  textAnchor="start"
                                  dominantBaseline="middle"
                                  fill="#2563eb"
                                  fontSize={10}
                                  fontWeight={700}
                                >
                                  {language === 'ko' ? '신규' : 'NEW'}
                                </text>
                              )}
                            </g>
                          );
                        }}
                      >
                        {displayData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>

                      {/* YoY Dot */}
                      <Scatter
                        xAxisId="yoy"
                        yAxisId="shops"
                        data={displayData}
                        dataKey="yoy_clamped"
                        fill="#ea580c"
                        shape="circle"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
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
                          ? (language === 'ko' ? `평당매출/1일 (${currencyCode}/평/일)` : `Sales/Area/Day (${currencyCode})`)
                          : (language === 'ko' ? `실판매출 (${currencyCode})` : `Sales (${currencyCode})`),
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
                      domain={[0, yoyAxisMax]}
                      ticks={getYoyTicks(yoyAxisMax)}
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
                        const isNew = isNewStore(payload.py_value);
                        
                        return (
                          <g>
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              fill={payload.color}
                              rx={4}
                              ry={4}
                            />
                            {isNew && (
                              <text
                                x={x + width / 2}
                                y={y - 5}
                                textAnchor="middle"
                                fill="#2563eb"
                                fontSize={11}
                                fontWeight={700}
                              >
                                {language === 'ko' ? '신규' : 'NEW'}
                              </text>
                            )}
                          </g>
                        );
                      }}
                    />
                    
                    <Line
                      yAxisId="yoy"
                      type="monotone"
                      dataKey="yoy_clamped"
                      stroke="#ea580c"
                      strokeWidth={2}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (isNewStore(payload.py_value)) {
                          // 신규 매장은 "신규" 텍스트 표시
                          return (
                            <text
                              x={cx}
                              y={cy - 10}
                              textAnchor="middle"
                              fill="#2563eb"
                              fontSize={10}
                              fontWeight={600}
                            >
                              {language === 'ko' ? '신규' : 'NEW'}
                            </text>
                          );
                        }
                        // 일반 매장은 기본 점
                        return <circle cx={cx} cy={cy} r={3} fill="#ea580c" />;
                      }}
                      activeDot={{ r: 5, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
                      connectNulls={false}
                      strokeOpacity={0.7}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          
          {/* 모달 하단 범례 - 데스크톱만 (Region별 동적 표시) */}
          {!isMobile && (
            <div className="px-6 pb-6 flex items-center justify-center gap-6 flex-wrap flex-shrink-0">
              {region === 'HKMC' ? (
                <>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#93C5FD' }}></div>
                <span className="text-sm text-gray-700">{getChannelLabel('HK정상')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FCA5A5' }}></div>
                <span className="text-sm text-gray-700">{getChannelLabel('HK아울렛')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#86EFAC' }}></div>
                <span className="text-sm text-gray-700">{getChannelLabel('MC정상')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FB923C' }}></div>
                <span className="text-sm text-gray-700">{getChannelLabel('MC아울렛')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#C4B5FD' }}></div>
                <span className="text-sm text-gray-700">{getChannelLabel('HK온라인')}</span>
              </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FDE047' }}></div>
                    <span className="text-sm text-gray-700">{getChannelLabel('TW정상')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#FDA4AF' }}></div>
                    <span className="text-sm text-gray-700">{getChannelLabel('TW아울렛')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#D8B4FE' }}></div>
                    <span className="text-sm text-gray-700">{getChannelLabel('TW온라인')}</span>
                  </div>
                </>
              )}
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
