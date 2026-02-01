'use client';

interface BrandSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export default function BrandSelect({ value, onChange }: BrandSelectProps) {
  const brands = [
    { code: 'M', label: 'MLB' },
    { code: 'X', label: 'Discovery' },
  ];

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="brand-select" className="text-sm font-medium text-gray-700">
        Brand:
      </label>
      <select
        id="brand-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {brands.map((brand) => (
          <option key={brand.code} value={brand.code}>
            {brand.label}
          </option>
        ))}
      </select>
    </div>
  );
}
