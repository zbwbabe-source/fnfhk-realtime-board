import fs from 'fs';
import path from 'path';

/**
 * CSV 파일에서 의류 카테고리 소분류 코드 목록 추출 (서버 사이드 전용)
 */
export function getApparelCategories(): string[] {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'category.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');

    const apparelCodes: string[] = [];
    const apparelLabel = '\uC758\uB958'; // "의류"

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [largeCategory, smallCode] = line.split(',').map((s) => s.trim());
      if (largeCategory === apparelLabel && smallCode) {
        apparelCodes.push(smallCode);
      }
    }

    if (apparelCodes.length === 0) {
      console.warn('category.csv parsed but no apparel categories found. Using hardcoded fallback list.');
      return getApparelCategoriesHardcoded();
    }

    return apparelCodes;
  } catch (error) {
    console.error('Error reading category.csv:', error);
    return getApparelCategoriesHardcoded();
  }
}

/**
 * 하드코딩된 의류 카테고리 목록 (백업)
 */
function getApparelCategoriesHardcoded(): string[] {
  return [
    'DP', 'LG', 'PT', 'SK', 'SM', 'SP', 'TP', 'WP',
    'BS', 'HD', 'KP', 'MT', 'OP', 'PQ', 'TK', 'TR', 'TS', 'WS',
    'DJ', 'DK', 'FD', 'JP', 'KC', 'WJ', 'S6',
    'DS', 'DD', 'DR', 'RS', 'SW', 'TO', 'DV', 'JK', 'KT', 'PD', 'VT',
    'DT', 'S2', 'S1', 'BV', 'ZT', 'CT', 'LE', 'S5', 'RL', 'SS', 'TL', 'BR'
  ];
}
