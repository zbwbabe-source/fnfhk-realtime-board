/**
 * 공통 카드 쉘 - 동일한 높이와 스타일 제공
 */
interface CardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function CardShell({ children, className = '' }: CardShellProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 h-[540px] flex flex-col relative ${className}`}>
      {children}
    </div>
  );
}

/**
 * 카드 헤더 - 제목만 (1단)
 */
interface CardHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
}

export function CardHeader({ title, subtitle }: CardHeaderProps) {
  return (
    <div className="px-4 pt-4 pb-2 flex-shrink-0">
      <h3 className="text-base font-semibold text-gray-900 leading-tight">
        {title}
      </h3>
      {subtitle && (
        <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
          {subtitle}
        </div>
      )}
    </div>
  );
}

/**
 * 카드 컨트롤 - 드롭다운/토글/확대버튼 (2단)
 */
interface CardControlsProps {
  children: React.ReactNode;
  expandButton?: React.ReactNode;
}

export function CardControls({ children, expandButton }: CardControlsProps) {
  return (
    <div className="px-4 pb-2 flex items-center gap-2 justify-between flex-shrink-0 flex-wrap md:flex-nowrap">
      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
        {children}
      </div>
      {expandButton && (
        <div className="flex-shrink-0">
          {expandButton}
        </div>
      )}
    </div>
  );
}

/**
 * 공통 차트 바디 - flex-1으로 남은 공간 전부 사용 (3단)
 */
interface CardChartBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardChartBody({ children, className = '' }: CardChartBodyProps) {
  return (
    <div className={`px-2 pb-4 flex-1 min-h-0 w-full ${className}`}>
      <div className="w-full h-full">
        {children}
      </div>
    </div>
  );
}

/**
 * 컴팩트 드롭다운 스타일
 */
export const compactSelectClass = "px-2 py-1 text-[11px] font-medium border border-gray-300 rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 h-[28px] min-w-[70px]";

/**
 * 컴팩트 버튼 그룹 스타일
 */
export const compactButtonGroupClass = "flex gap-0.5 bg-gray-100 rounded p-0.5 h-[30px]";
export const compactButtonClass = (isActive: boolean) => 
  `px-3 py-1 text-xs font-medium rounded transition-all flex items-center justify-center ${
    isActive 
      ? 'bg-white text-blue-600 shadow-sm' 
      : 'text-gray-600 hover:text-gray-900'
  }`;

/**
 * 확대 버튼
 */
interface ExpandButtonProps {
  onClick: () => void;
  title: string;
}

export function ExpandButton({ onClick, title }: ExpandButtonProps) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0 h-[30px] w-[30px] flex items-center justify-center"
      title={title}
    >
      <svg 
        className="w-4 h-4 text-gray-600" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" 
        />
      </svg>
    </button>
  );
}
