/**
 * 매장명 축약 코드 생성 유틸리티
 * 유사 입력(공백/특수문자/대소문자/로컬표기/오타)에도 동일한 축약코드 반환
 */

// 1) 고정 매핑 (canonicalKey -> shortCode)
const shortCodeMap: Record<string, string> = {
  ISQUARE: 'ISQ',
  YOHO: 'YHO',
  TIMESSQUARE: 'TSQ',
  HYSANPLACE: 'HSN',
  CITYGATEO: 'CTY',
  CITYGATE: 'CTY', // CITYGATE도 CTY로
  MONGKOK: 'MKK',
  MOKO: 'MOK',
  MEGAMALL: 'MGM',
  VENETIAN: 'VEN',
  SEANDOSQUARE: 'SEN',
  LONDONER: 'LDN',
  SEONADOO: 'SNO',
  OFFICALMLB: 'MLB',
  ZALORA: 'ZAL',
  LANGHAM: 'LHP',
  LANGHAMPLACE: 'LHP',
  NTP: 'NT1',
  NTP1: 'NT1',
  APM: 'APM',
  LCX: 'LCX',
  TMT: 'TMT',
  SHEUNGSHUI: 'SSH',
  YUENLONG: 'YUL',
  SENADO: 'SEN',
};

// 2) Alias 규칙 (로컬 표기 -> 영문)
const aliasMap: Record<string, string> = {
  '몽콕': 'MONGKOK',
  '타임스퀘어': 'TIMESSQUARE',
  '하이산': 'HYSANPLACE',
  '시티게이트': 'CITYGATE',
  '메가몰': 'MEGAMALL',
  '베네시안': 'VENETIAN',
  '런더너': 'LONDONER',
  '세나도': 'SENADO',
};

// 3) 부분 매칭 규칙 (포함 검사용)
const partialMatchRules: Array<{ pattern: string; replacement: string }> = [
  { pattern: 'TIMESSQUARE', replacement: 'TIMESSQUARE' },
  { pattern: 'HYSANPLACE', replacement: 'HYSANPLACE' },
  { pattern: 'CITYGATE', replacement: 'CITYGATE' },
  { pattern: 'MONGKOK', replacement: 'MONGKOK' },
  { pattern: 'MEGAMALL', replacement: 'MEGAMALL' },
  { pattern: 'VENETIAN', replacement: 'VENETIAN' },
  { pattern: 'SEANDOSQUARE', replacement: 'SEANDOSQUARE' },
  { pattern: 'LONDONER', replacement: 'LONDONER' },
  { pattern: 'OFFICALMLB', replacement: 'OFFICALMLB' },
  { pattern: 'LANGHAM', replacement: 'LANGHAM' },
  { pattern: 'SHEUNGSHUI', replacement: 'SHEUNGSHUI' },
  { pattern: 'YUENLONG', replacement: 'YUENLONG' },
];

/**
 * canonicalKey 생성 (강한 정규화)
 * 유사 입력을 동일한 키로 변환
 */
export function canonicalKey(storeName: string): string {
  if (!storeName) return '';

  // a) Unicode normalize
  let normalized = storeName.normalize('NFKD');

  // b) Alias 치환 (로컬 표기 -> 영문)
  for (const [local, english] of Object.entries(aliasMap)) {
    if (normalized.includes(local)) {
      normalized = normalized.replace(new RegExp(local, 'g'), english);
    }
  }

  // c) toUpperCase
  normalized = normalized.toUpperCase();

  // d) 모든 구분자 제거 (공백, 하이픈, 언더스코어, 괄호, 슬래시, 점 등)
  // 한글, 영문, 숫자만 남김
  normalized = normalized.replace(/[^가-힣A-Z0-9]/g, '');

  // e) 부분 매칭 규칙 적용 (예: MONGKOKSHOP -> MONGKOK)
  for (const rule of partialMatchRules) {
    if (normalized.includes(rule.pattern)) {
      // 패턴이 포함되어 있으면 해당 패턴으로 치환
      normalized = rule.replacement;
      break;
    }
  }

  // f) 최종적으로 영문/숫자만 남기기 (한글 제거)
  normalized = normalized.replace(/[^A-Z0-9]/g, '');

  return normalized;
}

/**
 * Fallback 규칙: 매핑에 없을 때 자동 생성
 */
function generateFallbackCode(canonical: string): string {
  if (!canonical) return 'UNK';

  // 영문/숫자만 추출
  const alphanumeric = canonical.replace(/[^A-Z0-9]/g, '');

  if (alphanumeric.length === 0) return 'UNK';

  // 단어 분리 시도 (대문자 기준)
  const words: string[] = [];
  let currentWord = '';
  
  for (let i = 0; i < alphanumeric.length; i++) {
    const char = alphanumeric[i];
    
    // 숫자는 별도 단어로
    if (/[0-9]/.test(char)) {
      if (currentWord) {
        words.push(currentWord);
        currentWord = '';
      }
      words.push(char);
    } else {
      currentWord += char;
    }
  }
  if (currentWord) words.push(currentWord);

  // 단어 2개 이상: 각 단어 첫 글자 조합 (최대 3자)
  if (words.length >= 2) {
    return words.slice(0, 3).map(w => w[0]).join('');
  }

  // 단어 1개: 앞 3글자
  if (alphanumeric.length >= 3) {
    return alphanumeric.substring(0, 3);
  }

  // 너무 짧으면 원문 유지
  return alphanumeric;
}

/**
 * 매장명 -> 축약 코드 변환 (메인 함수)
 */
export function getStoreShortCode(storeName: string): string {
  if (!storeName) return 'UNK';

  // 1) canonical key 생성
  const canonical = canonicalKey(storeName);

  // 2) 고정 매핑 확인
  if (shortCodeMap[canonical]) {
    return shortCodeMap[canonical];
  }

  // 3) Fallback 규칙 적용
  return generateFallbackCode(canonical);
}

/**
 * 매장명 축약 테스트 함수 (개발/디버깅용)
 */
export function testStoreShortCode() {
  const testCases = [
    'Mongkok',
    'Mong Kok',
    'MONG-KOK',
    '몽콕',
    'MONGKOK ',
    'Mongkok Shop',
    'Times Square',
    'TIMES SQUARE',
    'TimesSquare',
    'Hysan Place',
    'HYSAN-PLACE',
    'City Gate',
    'CITYGATE(O)',
    'iSQUARE',
    'i-SQUARE',
    'YOHO',
    'YoHo Mall',
  ];

  console.log('=== Store Short Code Test ===');
  testCases.forEach(name => {
    const canonical = canonicalKey(name);
    const code = getStoreShortCode(name);
    console.log(`"${name}" -> canonical: "${canonical}" -> code: "${code}"`);
  });
}

/**
 * 전체 매장 리스트에 대한 축약 코드 매핑 캐시 생성
 */
export function buildStoreCodeCache(storeNames: string[]): Map<string, string> {
  const cache = new Map<string, string>();
  
  storeNames.forEach(name => {
    const code = getStoreShortCode(name);
    cache.set(name, code);
  });
  
  return cache;
}
