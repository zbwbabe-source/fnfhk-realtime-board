'use client';

interface DateSelectProps {
  value: string;
  onChange: (value: string) => void;
  availableDates: string[];
}

export default function DateSelect({ value, onChange, availableDates }: DateSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="date-select" className="text-sm font-medium text-gray-700">
        Date:
      </label>
      <select
        id="date-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {availableDates.map((date) => (
          <option key={date} value={date}>
            {date}
          </option>
        ))}
      </select>
    </div>
  );
}
