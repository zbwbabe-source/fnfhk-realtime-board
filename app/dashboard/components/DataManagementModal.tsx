'use client';

import { useEffect, useState } from 'react';

type DataFileRow = {
  displayName: string;
  relativePath: string;
  kind: 'upload' | 'derived';
  usedBy: string[];
  source?: string;
  exists: boolean;
  updatedAt: string | null;
  sizeKb: number | null;
};

type SqlTableRow = {
  tableName: string;
  usedBy: string[];
  purpose: string;
};

type DataManagementResponse = {
  generatedAt: string;
  lastUpdatedAt: string | null;
  files: DataFileRow[];
  sqlTables: SqlTableRow[];
  notes?: {
    uploadHistoryScope?: string;
  };
};

interface DataManagementModalProps {
  open: boolean;
  onClose: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', { hour12: false });
}

export default function DataManagementModal({ open, onClose }: DataManagementModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<DataManagementResponse | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError('');

      try {
        const res = await fetch('/api/data-management', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load data management status');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">데이터 관리</h2>
            <p className="text-xs text-gray-500">최종 업데이트: {formatDateTime(data?.lastUpdatedAt || null)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>

        <div className="space-y-6 p-6">
          {loading && <div className="text-sm text-gray-600">불러오는 중...</div>}
          {error && <div className="text-sm text-red-600">오류: {error}</div>}

          {!loading && !error && data && (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">엑셀/CSV 업로드 및 파생 파일</h3>
                <p className="mb-3 text-xs text-gray-500">{data.notes?.uploadHistoryScope || ''}</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">파일</th>
                        <th className="px-3 py-2 text-left">구분</th>
                        <th className="px-3 py-2 text-left">최종 수정</th>
                        <th className="px-3 py-2 text-right">용량(KB)</th>
                        <th className="px-3 py-2 text-left">사용 위치</th>
                        <th className="px-3 py-2 text-left">파생 대상</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.files.map((file) => (
                        <tr key={file.relativePath} className="border-t">
                          <td className="px-3 py-2 font-medium">{file.displayName}</td>
                          <td className="px-3 py-2">{file.kind === 'upload' ? '업로드 원본' : '파생 데이터'}</td>
                          <td className="px-3 py-2">{formatDateTime(file.updatedAt)}</td>
                          <td className="px-3 py-2 text-right">{file.sizeKb ?? '-'}</td>
                          <td className="px-3 py-2">{file.usedBy.join(', ')}</td>
                          <td className="px-3 py-2">{file.source || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">SQL 소스 테이블</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">테이블</th>
                        <th className="px-3 py-2 text-left">용도</th>
                        <th className="px-3 py-2 text-left">사용 API</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sqlTables.map((table) => (
                        <tr key={table.tableName} className="border-t">
                          <td className="px-3 py-2 font-medium">{table.tableName}</td>
                          <td className="px-3 py-2">{table.purpose}</td>
                          <td className="px-3 py-2">{table.usedBy.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
