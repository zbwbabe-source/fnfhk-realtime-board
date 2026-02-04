import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 간단한 메모리 캐시 (프로덕션에서는 Redis 등 사용 권장)
const insightCache = new Map<string, { insights: DashboardInsights; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1시간

interface DashboardInsights {
  diagnosis: string;
  shortTermStrategy: string;
  longTermStrategy: string;
}

interface RequestBody {
  region: string;
  brand: string;
  asofDate: string;
  language: 'ko' | 'en';
  section1: {
    actual: number;
    yoy: number;
    progress: number;
  };
  section2: {
    sellthrough: number;
    totalSales: number;
    totalInbound: number;
  };
  section3: {
    currentStock: number;
    clearanceRate: number;
    stagnantRatio: number;
  };
}

/**
 * POST /api/insights/dashboard
 * 
 * AI를 활용한 대시보드 전체 인사이트 생성
 * - 현재 진단
 * - 단기전략
 * - 중장기 전략
 */
export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { region, brand, asofDate, language, section1, section2, section3 } = body;

    // 캐시 키 생성
    const cacheKey = `${region}-${brand}-${asofDate}-${language}`;
    
    // 캐시 확인
    const cached = insightCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('📦 Using cached insights for:', cacheKey);
      return NextResponse.json(cached.insights);
    }

    console.log('🤖 Generating AI insights for:', { region, brand, asofDate, language });

    // OpenAI API 키 확인
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ OPENAI_API_KEY not set, using fallback insights');
      return NextResponse.json(generateFallbackInsights(body, language));
    }

    // 프롬프트 생성
    const prompt = generatePrompt(body);

    // OpenAI API 호출 (GPT-4o-mini)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: language === 'ko' 
              ? '당신은 리테일 비즈니스 분석 전문가입니다. 간결하고 실행 가능한 인사이트를 제공합니다.'
              : 'You are a retail business analyst expert. Provide concise and actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return NextResponse.json(generateFallbackInsights(body, language));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 응답 파싱
    const insights = parseAIResponse(content, language);

    // 캐시 저장
    insightCache.set(cacheKey, { insights, timestamp: Date.now() });

    console.log('✅ Generated AI insights:', insights);
    return NextResponse.json(insights);

  } catch (error: any) {
    console.error('Error generating dashboard insights:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * AI 프롬프트 생성
 */
function generatePrompt(body: RequestBody): string {
  const { asofDate, language, section1, section2, section3 } = body;

  if (language === 'ko') {
    return `
${asofDate} 기준 리테일 대시보드 데이터를 분석해주세요:

[매장 매출]
- 당월실적: ${formatNumber(section1.actual)} HKD
- 전년대비(YoY): ${section1.yoy.toFixed(1)}%
- 목표달성률: ${section1.progress.toFixed(1)}%

[당시즌 판매율]
- 판매율: ${section2.sellthrough.toFixed(1)}%
- 누적판매: ${formatNumber(section2.totalSales)} HKD
- 누적입고: ${formatNumber(section2.totalInbound)} HKD

[과시즌 재고]
- 현재재고: ${formatNumber(section3.currentStock)} HKD
- 소진율: ${section3.clearanceRate.toFixed(1)}%
- 정체재고 비중: ${section3.stagnantRatio.toFixed(1)}%

다음 3가지를 각각 40자 이내로 작성해주세요:
1. 현재 진단: (현 상황에 대한 핵심 분석)
2. 단기전략: (1-2주 내 실행할 액션)
3. 중장기 전략: (1-3개월 관점의 방향성)

형식:
현재 진단: ...
단기전략: ...
중장기 전략: ...
`;
  } else {
    return `
Analyze the retail dashboard data as of ${asofDate}:

[Store Sales]
- MTD Actual: ${formatNumber(section1.actual)} HKD
- YoY: ${section1.yoy.toFixed(1)}%
- Target Achievement: ${section1.progress.toFixed(1)}%

[In-Season Sell-through]
- Sell-through Rate: ${section2.sellthrough.toFixed(1)}%
- Cumulative Sales: ${formatNumber(section2.totalSales)} HKD
- Cumulative Inbound: ${formatNumber(section2.totalInbound)} HKD

[Old-Season Inventory]
- Current Stock: ${formatNumber(section3.currentStock)} HKD
- Clearance Rate: ${section3.clearanceRate.toFixed(1)}%
- Stagnant Stock Ratio: ${section3.stagnantRatio.toFixed(1)}%

Provide 3 insights, each within 60 characters:
1. Current Diagnosis: (key analysis of current situation)
2. Short-term Strategy: (actions for next 1-2 weeks)
3. Long-term Strategy: (direction for next 1-3 months)

Format:
Current Diagnosis: ...
Short-term Strategy: ...
Long-term Strategy: ...
`;
  }
}

/**
 * AI 응답 파싱
 */
function parseAIResponse(content: string, language: 'ko' | 'en'): DashboardInsights {
  const lines = content.split('\n').filter(line => line.trim());
  
  let diagnosis = '';
  let shortTermStrategy = '';
  let longTermStrategy = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (language === 'ko') {
      if (trimmed.includes('현재 진단:') || trimmed.startsWith('1.')) {
        diagnosis = trimmed.replace(/^(1\.\s*)?현재 진단:\s*/i, '').trim();
      } else if (trimmed.includes('단기전략:') || trimmed.includes('단기 전략:') || trimmed.startsWith('2.')) {
        shortTermStrategy = trimmed.replace(/^(2\.\s*)?(단기\s?전략):\s*/i, '').trim();
      } else if (trimmed.includes('중장기 전략:') || trimmed.includes('중장기전략:') || trimmed.startsWith('3.')) {
        longTermStrategy = trimmed.replace(/^(3\.\s*)?(중장기\s?전략):\s*/i, '').trim();
      }
    } else {
      if (trimmed.toLowerCase().includes('current diagnosis:') || trimmed.startsWith('1.')) {
        diagnosis = trimmed.replace(/^(1\.\s*)?current diagnosis:\s*/i, '').trim();
      } else if (trimmed.toLowerCase().includes('short-term strategy:') || trimmed.toLowerCase().includes('short term strategy:') || trimmed.startsWith('2.')) {
        shortTermStrategy = trimmed.replace(/^(2\.\s*)?short-?term strategy:\s*/i, '').trim();
      } else if (trimmed.toLowerCase().includes('long-term strategy:') || trimmed.toLowerCase().includes('long term strategy:') || trimmed.startsWith('3.')) {
        longTermStrategy = trimmed.replace(/^(3\.\s*)?long-?term strategy:\s*/i, '').trim();
      }
    }
  }

  return {
    diagnosis: diagnosis || (language === 'ko' ? '데이터 분석 중입니다.' : 'Analyzing data...'),
    shortTermStrategy: shortTermStrategy || (language === 'ko' ? '전략 수립 중입니다.' : 'Developing strategy...'),
    longTermStrategy: longTermStrategy || (language === 'ko' ? '중장기 방향 검토 중입니다.' : 'Reviewing long-term direction...'),
  };
}

/**
 * OpenAI API 키가 없을 때 사용하는 폴백 인사이트
 */
function generateFallbackInsights(body: RequestBody, language: 'ko' | 'en'): DashboardInsights {
  const { section1, section2, section3 } = body;

  if (language === 'ko') {
    // 규칙 기반 인사이트 생성
    let diagnosis = '';
    let shortTermStrategy = '';
    let longTermStrategy = '';

    // 현재 진단
    if (section1.progress >= 100 && section1.yoy >= 100) {
      diagnosis = '매출 목표 초과 달성, 전년대비 성장세 유지 중.';
    } else if (section1.progress >= 80) {
      diagnosis = `목표대비 ${section1.progress.toFixed(0)}%, 마감까지 추가 매출 필요.`;
    } else {
      diagnosis = `목표대비 ${section1.progress.toFixed(0)}%로 부진, 즉각적인 대응 필요.`;
    }

    // 단기전략
    if (section2.sellthrough < 50) {
      shortTermStrategy = '판매율 제고를 위한 프로모션 집중 필요.';
    } else if (section1.progress < 80) {
      shortTermStrategy = '주말 집중 판매로 목표 달성률 개선 추진.';
    } else {
      shortTermStrategy = '현 판매 모멘텀 유지, 인기 상품 재고 확보.';
    }

    // 중장기 전략
    if (section3.stagnantRatio > 20) {
      longTermStrategy = '정체재고 클리어런스 전략 수립 시급.';
    } else if (section3.clearanceRate < 30) {
      longTermStrategy = '과시즌 재고 소진 가속화 방안 검토 필요.';
    } else {
      longTermStrategy = '시즌 전환 대비 재고 최적화 지속 추진.';
    }

    return { diagnosis, shortTermStrategy, longTermStrategy };
  } else {
    // English fallback
    let diagnosis = '';
    let shortTermStrategy = '';
    let longTermStrategy = '';

    if (section1.progress >= 100 && section1.yoy >= 100) {
      diagnosis = 'Sales exceeding target with YoY growth maintained.';
    } else if (section1.progress >= 80) {
      diagnosis = `${section1.progress.toFixed(0)}% of target, need push before month-end.`;
    } else {
      diagnosis = `${section1.progress.toFixed(0)}% of target, immediate action required.`;
    }

    if (section2.sellthrough < 50) {
      shortTermStrategy = 'Focus on promotions to improve sell-through rate.';
    } else if (section1.progress < 80) {
      shortTermStrategy = 'Intensify weekend sales to improve target achievement.';
    } else {
      shortTermStrategy = 'Maintain momentum, secure inventory for top sellers.';
    }

    if (section3.stagnantRatio > 20) {
      longTermStrategy = 'Urgent: Develop stagnant inventory clearance plan.';
    } else if (section3.clearanceRate < 30) {
      longTermStrategy = 'Review strategies to accelerate old-season clearance.';
    } else {
      longTermStrategy = 'Continue inventory optimization for season transition.';
    }

    return { diagnosis, shortTermStrategy, longTermStrategy };
  }
}

/**
 * 숫자 포맷팅 (K, M 단위)
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toFixed(0);
}
