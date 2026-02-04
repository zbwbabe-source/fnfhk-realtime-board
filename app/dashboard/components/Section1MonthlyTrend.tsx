'use client';

import { useState, useEffect } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { t, type Language } from '@/lib/translations';

interface MonthlyTrendProps {
  region: string;
  brand: string;
  date: string;
  language: Language;
}

interface MonthlyRow {
  month: string;
  sales_amt: number;
  yoy: number | null;
}

export default function Section1MonthlyTrend({ region, brand, date, language }: MonthlyTrendProps) {
  const [data, setData] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showYoY, setShowYoY] = useState(false); // false = 실판매출, true = YoY

  useEffect(() => {
    if (!date) return;

    async function fetchData() {
      setLoading(true);
      setError('');

      try {
        const res = await fetch(
          `/api/section1/monthly-trend?region=${region}&brand=${brand}&date=${date}`
        );

        if (!res.ok) {
          throw new Error('Failed to fetch monthly trend');
        }

        const json = await res.json();
        setData(json.rows || []);
      } catch (err: any) {
        console.error('Monthly trend fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, brand, date]);

  // 숫자 포맷팅
  const formatSales = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    return `${(value / 1000).toFixed(0)}K`;
  };

  const formatYoY = (value: number | null) => {
    if (value === null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  // Tooltip 커스텀
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;

    return (
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
        <p className="text-sm font-semibold text-gray-900 mb-2">{data.month}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span className="text-xs text-gray-600">
              {language === 'ko' ? '매출' : 'Sales'}:
            </span>
            <span className="text-sm font-semibold text-blue-600">
              {formatSales(data.sales_amt)} HKD
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-600"></div>
            <span className="text-xs text-gray-600">YoY:</span>
            <span className={`text-sm font-semibold ${
              data.yoy === null ? 'text-gray-400' : 
              data.yoy >= 100 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatYoY(data.yoy)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="h-80 flex items-center justify-center">
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
        <div className="h-80 flex items-center justify-center">
          <div className="text-red-500 text-sm">
            {language === 'ko' ? '데이터를 불러오지 못했습니다.' : 'Failed to load data.'}
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">
          {language === 'ko' ? '월별 매출 & YoY 추이' : 'Monthly Sales & YoY Trend'}
        </h3>
        <div className="h-80 flex items-center justify-center">
          <div className="text-gray-500 text-sm">
            {language === 'ko' ? '데이터가 없습니다.' : 'No data available.'}
          </div>
        </div>
      </div>
    );
  }

  // Y축 범위 계산
  const maxSales = Math.max(...data.map(d => d.sales_amt));
  const yoyValues = data.filter(d => d.yoy !== null).map(d => d.yoy as number);
  const maxYoY = yoyValues.length > 0 ? Math.max(...yoyValues) : 100;
  const minYoY = yoyValues.length > 0 ? Math.min(...yoyValues) : -100;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* 헤더와 토글 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {language === 'ko' ? '월별 추이 (최근 6개월)' : 'Monthly Trend (Last 6 Months)'}
        </h3>
        
        {/* 실판매출/YoY 전환 버튼 */}
        <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setShowYoY(false)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              !showYoY
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {language === 'ko' ? '실판매출' : 'Sales'}
          </button>
          <button
            onClick={() => setShowYoY(true)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              showYoY
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            YoY
          </button>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          
          {/* X축: 월 */}
          <XAxis
            dataKey="month"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => {
              // YYYY-MM -> MM월 or MM
              const month = value.split('-')[1];
              return language === 'ko' ? `${month}월` : month;
            }}
          />
          
          {showYoY ? (
            // YoY 모드: YoY만 표시 (단일 축)
            <>
              <YAxis
                stroke="#ea580c"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `${value}%`}
                domain={[Math.min(minYoY * 0.8, 50), Math.max(maxYoY * 1.2, 150)]}
                label={{
                  value: 'YoY (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: '12px', fill: '#ea580c' }
                }}
              />
              
              <Tooltip content={<CustomTooltip />} />
              
              <Line
                type="monotone"
                dataKey="yoy"
                stroke="#ea580c"
                strokeWidth={3}
                dot={{ r: 4, fill: '#ea580c' }}
                activeDot={{ r: 6 }}
                name="YoY"
                connectNulls={false}
              />
            </>
          ) : (
            // 실판매출 모드: 매출만 표시 (단일 축)
            <>
              <YAxis
                stroke="#2563eb"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatSales(value)}
                domain={[0, maxSales * 1.1]}
                label={{
                  value: language === 'ko' ? '매출 (HKD)' : 'Sales (HKD)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: '12px', fill: '#2563eb' }
                }}
              />
              
              <Tooltip content={<CustomTooltip />} />
              
              <Bar
                dataKey="sales_amt"
                fill="#2563eb"
                name={language === 'ko' ? '매출' : 'Sales'}
                radius={[4, 4, 0, 0]}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
