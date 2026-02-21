'use client';

import { Fragment, useEffect, useState } from 'react';

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
  queryExamples?: Array<{
    name: string;
    source: string;
    sql: string;
  }>;
};

type DataManagementResponse = {
  generatedAt: string;
  lastUpdatedAt: string | null;
  files: DataFileRow[];
  sqlTables: SqlTableRow[];
  isDevelopment?: boolean;
  notes?: {
    uploadHistoryScope?: string;
    sqlSourceScope?: string;
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
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

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
            <h2 className="text-lg font-semibold text-gray-900">Data Management</h2>
            <p className="text-xs text-gray-500">Last updated: {formatDateTime(data?.lastUpdatedAt || null)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          {loading && <div className="text-sm text-gray-600">Loading...</div>}
          {error && <div className="text-sm text-red-600">Error: {error}</div>}

          {!loading && !error && data && (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Excel/CSV Upload and Derived Files</h3>
                <p className="mb-3 text-xs text-gray-500">{data.notes?.uploadHistoryScope || ''}</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">File</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Updated At</th>
                        <th className="px-3 py-2 text-right">Size (KB)</th>
                        <th className="px-3 py-2 text-left">Used By</th>
                        <th className="px-3 py-2 text-left">Derived Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.files.map((file) => (
                        <tr key={file.relativePath} className="border-t">
                          <td className="px-3 py-2 font-medium">{file.displayName}</td>
                          <td className="px-3 py-2">{file.kind === 'upload' ? 'Upload source' : 'Derived data'}</td>
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
                <h3 className="mb-2 text-sm font-semibold text-gray-900">SQL Source Tables</h3>
                {data.notes?.sqlSourceScope && <p className="mb-3 text-xs text-gray-500">{data.notes.sqlSourceScope}</p>}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Table</th>
                        <th className="px-3 py-2 text-left">Purpose</th>
                        <th className="px-3 py-2 text-left">Used APIs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sqlTables.map((table) => {
                        const isOpen = expandedTable === table.tableName;
                        const canExpand = !!table.queryExamples?.length;
                        return (
                          <Fragment key={table.tableName}>
                            <tr
                              className={`border-t ${canExpand ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                              onClick={() => (canExpand ? setExpandedTable(isOpen ? null : table.tableName) : undefined)}
                            >
                              <td className="px-3 py-2 font-medium">{table.tableName}</td>
                              <td className="px-3 py-2">{table.purpose}</td>
                              <td className="px-3 py-2">{table.usedBy.join(', ')}</td>
                            </tr>
                            {isOpen && canExpand ? (
                              <tr className="border-t bg-gray-50/70">
                                <td className="px-3 py-3" colSpan={3}>
                                  <div className="space-y-3">
                                    {table.queryExamples!.map((q) => (
                                      <div key={`${table.tableName}-${q.name}`} className="rounded-md border bg-white p-3">
                                        <div className="mb-1 text-xs font-semibold text-gray-700">{q.name}</div>
                                        <div className="mb-2 text-xs text-gray-500">{q.source}</div>
                                        <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                                          <code>{q.sql}</code>
                                        </pre>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
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
