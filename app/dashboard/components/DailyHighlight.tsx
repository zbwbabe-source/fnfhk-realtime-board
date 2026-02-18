'use client';

import { t, type Language } from '@/lib/translations';

interface DailyHighlightProps {
  date: string;
  brand: string;
  language: Language;
}

export default function DailyHighlight({ date, brand, language }: DailyHighlightProps) {
  // 날짜 포맷팅 (YYYY-MM-DD)
  const formattedDate = date || 'N/A';

  return (
    <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 rounded-lg shadow-md border-l-4 border-purple-600 p-6 mb-6">
      <div className="flex items-start gap-4">
        {/* 아이콘 */}
        <div className="flex-shrink-0">
          <span className="text-4xl">🌟</span>
        </div>
        
        {/* 컨텐츠 */}
        <div className="flex-1">
          {/* 헤더 */}
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xl font-bold text-gray-900">
              {t(language, 'dailyHighlight')}
            </h2>
            <span className="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-gray-200">
              {formattedDate} · {brand}
            </span>
          </div>
          
          {/* 하이라이트 내용 (플레이스홀더) */}
          <div className="bg-white rounded-lg p-4 border border-purple-200">
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-pulse flex items-center gap-2">
                <div className="h-2 w-2 bg-purple-400 rounded-full"></div>
                <div className="h-2 w-2 bg-purple-400 rounded-full animation-delay-200"></div>
                <div className="h-2 w-2 bg-purple-400 rounded-full animation-delay-400"></div>
              </div>
              <span className="text-sm italic">
                {t(language, 'highlightPlaceholder')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
