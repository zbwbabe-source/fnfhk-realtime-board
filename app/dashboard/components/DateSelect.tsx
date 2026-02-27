'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '@/lib/translations';

interface DateSelectProps {
  value: string;
  onChange: (value: string) => void;
  availableDates: string[];
  disabled?: boolean;
  language?: Language;
}

function getWeekdayToken(dateStr: string, language: Language): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDay(); // 0 = Sun
  const en = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const ko = ['일', '월', '화', '수', '목', '금', '토'];
  return language === 'en' ? en[day] : ko[day];
}

export default function DateSelect({
  value,
  onChange,
  availableDates,
  disabled = false,
  language = 'ko',
}: DateSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const latestDate = availableDates[0] || '';
  const oldestDate = availableDates[availableDates.length - 1] || '';
  const isDisabled = disabled || availableDates.length === 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resolveToAvailableDate = (candidate: string): string => {
    if (!candidate) return '';
    if (availableDateSet.has(candidate)) return candidate;
    return availableDates.find((date) => date <= candidate) || latestDate || candidate;
  };

  const handleDateInputChange = (nextValue: string) => {
    const resolved = resolveToAvailableDate(nextValue);
    if (!resolved) return;
    onChange(resolved);
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <label htmlFor="date-picker-trigger" className="text-sm font-medium text-gray-700">
        Date:
      </label>

      <button
        id="date-picker-trigger"
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex min-w-[168px] items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{value || latestDate || '-'}</span>
        <svg className="ml-3 h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6 2a1 1 0 012 0v1h4V2a1 1 0 112 0v1h1.5A2.5 2.5 0 0118 5.5v10A2.5 2.5 0 0115.5 18h-11A2.5 2.5 0 012 15.5v-10A2.5 2.5 0 014.5 3H6V2zm10 5H4v8.5c0 .276.224.5.5.5h11a.5.5 0 00.5-.5V7z" />
        </svg>
      </button>

      {isOpen && !isDisabled && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Calendar</p>
            <input
              type="date"
              value={value || latestDate}
              min={oldestDate}
              max={latestDate}
              lang={language === 'en' ? 'en-US' : 'ko-KR'}
              onChange={(e) => handleDateInputChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent</p>
            <div className="grid grid-cols-2 gap-2">
              {availableDates.slice(0, 6).map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => {
                    onChange(date);
                    setIsOpen(false);
                  }}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    value === date
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {date} {language === 'en' ? `(${getWeekdayToken(date, language)})` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
