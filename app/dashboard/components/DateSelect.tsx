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

const MIN_SELECTABLE_DATE = '2026-01-01';

function getWeekdayToken(dateStr: string, language: Language): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDay(); // 0 = Sun
  const en = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const ko = ['일', '월', '화', '수', '목', '금', '토'];
  return language === 'en' ? en[day] : ko[day];
}

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const selectableDates = useMemo(
    () => availableDates.filter((date) => date >= MIN_SELECTABLE_DATE),
    [availableDates]
  );
  const availableDateSet = useMemo(() => new Set(selectableDates), [selectableDates]);
  const latestDate = selectableDates[0] || '';
  const oldestDate = selectableDates[selectableDates.length - 1] || '';
  const isDisabled = disabled || selectableDates.length === 0;
  const baseDate = value && value >= MIN_SELECTABLE_DATE ? value : latestDate;

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
    const normalizedCandidate = candidate < MIN_SELECTABLE_DATE ? MIN_SELECTABLE_DATE : candidate;
    if (availableDateSet.has(normalizedCandidate)) return normalizedCandidate;
    return (
      selectableDates.find((date) => date <= normalizedCandidate) ||
      oldestDate ||
      latestDate ||
      normalizedCandidate
    );
  };

  const handleDateInputChange = (nextValue: string) => {
    const resolved = resolveToAvailableDate(nextValue);
    if (!resolved) return;
    onChange(resolved);
  };

  const pastMonthEnds = useMemo(() => {
    if (!baseDate) return [];

    const [yearStr, monthStr] = baseDate.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return [];

    const results: string[] = [];
    for (let m = month - 1; m >= 1; m -= 1) {
      results.push(formatDateString(new Date(year, m, 0)));
    }

    return results
      .map((date) => ({
        raw: date,
        resolved: resolveToAvailableDate(date),
      }))
      .filter((item, index, items) => {
        if (!item.resolved) return false;
        return items.findIndex((candidate) => candidate.resolved === item.resolved) === index;
      });
  }, [baseDate, latestDate, availableDateSet]);

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
              value={baseDate}
              min={MIN_SELECTABLE_DATE}
              max={latestDate}
              lang={language === 'en' ? 'en-US' : 'ko-KR'}
              onChange={(e) => handleDateInputChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent</p>
            <div className="grid grid-cols-2 gap-2">
              {selectableDates.slice(0, 4).map((date) => (
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

          {pastMonthEnds.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Month End</p>
              <div className="grid grid-cols-2 gap-2">
                {pastMonthEnds.map(({ raw, resolved }) => (
                  <button
                    key={raw}
                    type="button"
                    onClick={() => {
                      onChange(resolved);
                      setIsOpen(false);
                    }}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      value === resolved
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {raw}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
