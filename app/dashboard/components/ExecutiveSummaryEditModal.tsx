'use client';

import { useState, useEffect } from 'react';
import { type Language } from '@/lib/translations';

interface ExecutiveSummaryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: {
    main_summary: string;
    key_insights: string[];
  };
  region: string;
  brand: string;
  date: string;
  language: Language;
  onSave: (data: { main_summary: string; key_insights: string[] }) => void;
}

export default function ExecutiveSummaryEditModal({
  isOpen,
  onClose,
  initialData,
  region,
  brand,
  date,
  language,
  onSave
}: ExecutiveSummaryEditModalProps) {
  const [mainSummary, setMainSummary] = useState(initialData.main_summary);
  const [keyInsights, setKeyInsights] = useState<string[]>(initialData.key_insights);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // initialData가 변경되면 state 업데이트
  useEffect(() => {
    setMainSummary(initialData.main_summary);
    setKeyInsights(initialData.key_insights);
  }, [initialData]);

  const handleSave = async () => {
    if (!mainSummary.trim()) {
      setError(language === 'ko' ? '주요내용을 입력해주세요.' : 'Please enter main summary.');
      return;
    }

    if (keyInsights.some(insight => !insight.trim())) {
      setError(language === 'ko' ? '모든 핵심인사이트를 입력해주세요.' : 'Please enter all key insights.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/insights/summary/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          brand,
          date,
          main_summary: mainSummary,
          key_insights: keyInsights.filter(i => i.trim()),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save edited summary');
      }

      console.log('✅ Summary edited and saved');
      onSave({
        main_summary: mainSummary,
        key_insights: keyInsights.filter(i => i.trim()),
      });
      onClose();
    } catch (err: any) {
      console.error('❌ Save error:', err);
      setError(language === 'ko' ? '저장 중 오류가 발생했습니다.' : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const addInsight = () => {
    setKeyInsights([...keyInsights, '']);
  };

  const removeInsight = (index: number) => {
    setKeyInsights(keyInsights.filter((_, i) => i !== index));
  };

  const updateInsight = (index: number, value: string) => {
    const updated = [...keyInsights];
    updated[index] = value;
    setKeyInsights(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {language === 'ko' ? 'AI 요약 편집' : 'Edit AI Summary'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 주요내용 */}
          <div>
            <label className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700">
              <span className="text-xl">📊</span>
              {language === 'ko' ? '주요내용' : 'Main Summary'}
            </label>
            <textarea
              value={mainSummary}
              onChange={(e) => setMainSummary(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
              rows={6}
              placeholder={language === 'ko' ? '주요 내용을 입력하세요...' : 'Enter main summary...'}
            />
            <div className="mt-1 text-xs text-gray-500 text-right">
              {mainSummary.length} / 300 {language === 'ko' ? '자' : 'characters'}
            </div>
          </div>

          {/* 핵심인사이트 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <span className="text-xl">💡</span>
                {language === 'ko' ? '핵심인사이트' : 'Key Insights'}
              </label>
              <button
                onClick={addInsight}
                className="px-3 py-1 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-md transition-colors"
              >
                + {language === 'ko' ? '추가' : 'Add'}
              </button>
            </div>

            <div className="space-y-3">
              {keyInsights.map((insight, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-orange-500 font-bold mt-2 flex-shrink-0">•</span>
                  <textarea
                    value={insight}
                    onChange={(e) => updateInsight(index, e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
                    rows={2}
                    placeholder={language === 'ko' ? '인사이트를 입력하세요...' : 'Enter insight...'}
                  />
                  <button
                    onClick={() => removeInsight(index)}
                    className="flex-shrink-0 mt-2 text-gray-400 hover:text-red-500 transition-colors"
                    title={language === 'ko' ? '삭제' : 'Delete'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {language === 'ko' ? '취소' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {language === 'ko' ? '저장 중...' : 'Saving...'}
              </>
            ) : (
              language === 'ko' ? '저장' : 'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
