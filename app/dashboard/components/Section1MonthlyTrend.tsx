'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
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
              data.yoy >= 0 ? 'text-green-600' : 'text-red-600'
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
      <h3 className="text-lg font-semibold mb-4 text-gray-900">
        {language === 'ko' ? '월별 매출 & YoY 추이 (최근 12개월)' : 'Monthly Sales & YoY Trend (Last 12 Months)'}
      </h3>
      
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
          
          {/* 왼쪽 Y축: 매출 */}
          <YAxis
            yAxisId="left"
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
          
          {/* 오른쪽 Y축: YoY */}
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#ea580c"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `${value}%`}
            domain={[Math.min(minYoY * 1.2, -20), Math.max(maxYoY * 1.2, 20)]}
            label={{
              value: 'YoY (%)',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: '12px', fill: '#ea580c' }
            }}
          />
          
          {/* Tooltip */}
          <Tooltip content={<CustomTooltip />} />
          
          {/* Legend */}
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          
          {/* 매출 라인 */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="sales_amt"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3, fill: '#2563eb' }}
            activeDot={{ r: 5 }}
            name={language === 'ko' ? '매출' : 'Sales'}
            connectNulls={false}
          />
          
          {/* YoY 라인 */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="yoy"
            stroke="#ea580c"
            strokeWidth={2}
            dot={{ r: 3, fill: '#ea580c' }}
            activeDot={{ r: 5 }}
            name="YoY"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
