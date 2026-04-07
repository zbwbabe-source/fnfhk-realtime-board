import categoryMapping from '@/data/category_mapping.json';

interface CategoryMapping {
  large: string;
  middle: string;
  small: string;
}

const categoryDetailNames: Record<string, string> = {
  AC: 'Props',
  BG: 'Bag',
  BK: 'Backpack',
  BM: 'Bucket Bag',
  BN: 'Beanie',
  BQ: 'Shoulder Bag',
  BR: 'Bra',
  BS: 'Baseball Shirts',
  BV: 'Baby',
  BW: 'Boston Bag',
  BZ: 'Body Bag',
  CB: 'Beret',
  CP: 'Cap',
  CR: 'Crossbody Bag',
  CT: 'Coat',
  CV: 'Canvas Shoes',
  DC: 'Down Scarf',
  DD: 'Denim Dress',
  DJ: 'Jumper',
  DK: 'Denim Jacket',
  DP: 'Pants',
  DR: 'Denim Shirt',
  DS: 'Skirt',
  DT: 'Pants',
  DV: 'Vest',
  ET: 'Accessary',
  FD: 'Fleece Jumper',
  GL: 'Glove',
  HD: 'Sweat Shirts',
  HS: 'Hip Sack',
  HT: 'Hat',
  JA: 'Earrings',
  JB: 'Necklace',
  JC: 'Bracelet',
  JD: 'Ring',
  JK: 'Jacket',
  JP: 'Jumper',
  KC: 'Knit Cardigan',
  KP: 'Sweater Pullover',
  KT: 'Knit',
  LE: 'Leather',
  LG: 'Pants',
  LP: 'Slippers',
  MC: 'Meshed Cap',
  MF: 'Muffler',
  ML: 'Arm Sleeve',
  MR: 'Messenger bag',
  MT: 'Sweat Shirts',
  MU: 'Mules',
  OP: 'Onepiece',
  OR: 'Shopping Bag',
  PD: 'Padded Jumper',
  PE: 'Pet',
  PO: 'Pouch',
  PQ: 'Polo shirt',
  RL: 'Long-sleeve T-shirt',
  RN: 'Running Shoes',
  RS: 'Short-sleeve T-shirt',
  S1: 'T-Shirt & Sweatpants',
  S2: 'Sweatshirt & Sweatpants',
  S5: 'Training Set',
  S6: 'Sleeveless Shirt&Shorts',
  SC: 'Sun Cap',
  SD: 'Sandals',
  SG: 'Slingback shoes',
  SH: 'Shoes',
  SK: 'Skirt',
  SM: 'Short Pants',
  SO: 'Socks',
  SP: 'Short Pants',
  SQ: 'Shoes',
  SS: 'Softshell Jacket',
  SW: 'Swim Wear',
  SX: 'Sneakers',
  TB: 'Bottom',
  TG: 'Bag',
  TK: 'Tank Top',
  TL: 'Long-sleeve Tee',
  TO: 'Top',
  TP: 'Pants',
  TR: 'T/Shirts',
  TS: 'T/Shirts',
  TW: 'Towel',
  UB: 'Shoe Bag',
  VT: 'Vest',
  WB: 'Winter Boots',
  WJ: 'Windbreaker',
  WM: 'Winter Headwear',
  WP: 'Pants',
  WR: 'Wire Cap',
  WS: 'Woven Shirts',
  ZT: 'T/Shirts',
};

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

export function getCategoryDetailName(smallCode: string): string {
  const normalized = String(smallCode || '').trim().toUpperCase();
  return categoryDetailNames[normalized] || '';
}

export function getCategoryTooltipText(smallCode: string): string {
  const normalized = String(smallCode || '').trim().toUpperCase();
  if (!normalized) return '';

  const detail = getCategoryDetailName(normalized);
  if (detail) {
    return `${normalized} - ${detail}`;
  }

  const mapping = getCategoryMapping(normalized);
  if (mapping.middle && mapping.middle !== 'Unknown') {
    return `${normalized} - ${mapping.middle}`;
  }

  return normalized;
}
