'use client';

interface RegionToggleProps {
  value: string;
  onChange: (value: string) => void;
}

export default function RegionToggle({ value, onChange }: RegionToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700">Region:</label>
      <div className="inline-flex rounded-md shadow-sm">
        <button
          onClick={() => onChange('HKMC')}
          className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
            value === 'HKMC'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          HKMC
        </button>
        <button
          onClick={() => onChange('TW')}
          className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-b border-r ${
            value === 'TW'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          TW
        </button>
      </div>
    </div>
  );
}
