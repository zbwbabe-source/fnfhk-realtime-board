'use client';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
  language: 'ko' | 'en';
}

export default function GuideModal({ open, onClose, language }: GuideModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {language === 'ko' ? '대시보드 설명' : 'Dashboard Guide'}
            </h2>
            <p className="text-xs text-gray-500">
              {language === 'ko'
                ? '화면 의미와 계산 방법을 쉽게 정리한 안내서입니다.'
                : 'A simple guide to the dashboard meaning and calculations.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {language === 'ko' ? '닫기' : 'Close'}
          </button>
        </div>

        <iframe
          src={`/dashboard/guide?lang=${language}`}
          title={language === 'ko' ? '대시보드 설명서' : 'Dashboard Guide'}
          className="h-[78vh] w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
