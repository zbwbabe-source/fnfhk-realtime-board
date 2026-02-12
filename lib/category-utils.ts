import categoryMapping from '@/data/category_mapping.json';

interface CategoryMapping {
  large: string;
  middle: string;
  small: string;
}

/**
 * 소분류 코드(2글자)를 대분류-중분류-소분류로 매핑
 */
export function getCategoryMapping(smallCode: string): CategoryMapping {
  const mapping = (categoryMapping as Record<string, CategoryMapping>)[smallCode];
  return mapping || { 
    large: '기타', 
    middle: 'Unknown', 
    small: smallCode 
  };
}


/**
 * 대분류별 파스텔 컬러 반환
 */
export function getColorByLargeCategory(large: string): string {
  const colors: Record<string, string> = {
    '의류': '#93C5FD',      // 파란 파스텔
    '신발': '#FCA5A5',      // 빨간 파스텔
    '모자': '#FDE047',      // 노란 파스텔
    '가방': '#86EFAC',      // 초록 파스텔
    '기타ACC': '#C4B5FD',   // 보라 파스텔
  };
  return colors[large] || '#D1D5DB';
}

/**
 * 중분류별 색상 (대분류 색상의 다양한 톤)
 */
export function getColorByMiddleCategory(large: string, middle: string): string {
  const colorMap: Record<string, Record<string, string>> = {
    '의류': {
      'OUTER': '#93C5FD',    // 밝은 파랑
      'INNER': '#60A5FA',    // 중간 파랑
      'BOTTOM': '#3B82F6',   // 진한 파랑
      'Wear_etc': '#BFDBFE', // 연한 파랑
    },
    '신발': {
      'Shoes': '#FCA5A5',    // 빨간 파스텔
    },
    '모자': {
      'Headwear': '#FDE047', // 노란 파스텔
    },
    '가방': {
      'BAG': '#86EFAC',      // 초록 파스텔
    },
    '기타ACC': {
      'Acc_etc': '#C4B5FD',  // 보라 파스텔
    },
  };
  
  return colorMap[large]?.[middle] || getColorByLargeCategory(large);
}

/**
 * 소분류 코드의 색상 (중분류 기반)
 */
export function getColorBySmallCategory(smallCode: string): string {
  const mapping = getCategoryMapping(smallCode);
  return getColorByMiddleCategory(mapping.large, mapping.middle);
}
